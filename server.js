const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { DownloadManager } = require('./download-manager');
const credStore = require('./credential-store');
const https = require('https');

const app = express();
const PORT = 3000;

const MODS_DIR_DEFAULT = path.join(process.env.APPDATA || '', 'Factorio', 'mods');
let userModPath = MODS_DIR_DEFAULT;
let userGamePath = ''; // global
let activeProfile = 'default';

const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.userModPath) {
        userModPath = config.userModPath;
      }
      if (config.userGamePath) {
        userGamePath = config.userGamePath;
      }
      if (config.activeProfile) {
        activeProfile = config.activeProfile;
      }
    }
  } catch (err) {
    console.warn('Could not load config.json:', err.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ userModPath, userGamePath, activeProfile }, null, 2));
  } catch (err) {
    console.warn('Could not save config.json:', err.message);
  }
}

// Load config immediately
loadConfig();

// === Download Manager (singleton) ===
const downloadManager = new DownloadManager(() => userModPath);

const BACKUP_DIR = process.env.NODE_ENV === 'test' ? path.join(__dirname, 'test-backup') : path.join(__dirname, 'backup');
const PROFILES_DIR = process.env.NODE_ENV === 'test' ? path.join(__dirname, 'test-profiles') : path.join(__dirname, 'profiles');
const LOCAL_MOD_LIST = process.env.NODE_ENV === 'test' ? path.join(__dirname, 'test-mod-list', 'mod-list.json') : path.join(__dirname, 'mod-list', 'mod-list.json');

// === Ensure folders ===
fse.ensureDirSync(PROFILES_DIR);
fse.ensureDirSync(BACKUP_DIR);
fse.ensureDirSync(path.dirname(LOCAL_MOD_LIST));

app.use(express.static('public'));
app.use('/Assets', express.static(path.join(__dirname, 'Assets')));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// === Serve index ===
app.get('/', (req, res) => res.render('index'));

app.get('/game-thumbs/*', (req, res) => {
  if (!userGamePath) return res.status(404).send('Game path not set');
  const relativePath = req.params[0];
  const fullPath = path.join(userGamePath, 'data', relativePath);
  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send('Not found');
  }
});

// === Helpers ===
function getModListPath() {
  return path.join(userModPath, 'mod-list.json');
}

function readModList() {
  try {
    const file = fs.readFileSync(getModListPath(), 'utf-8');
    const json = JSON.parse(file);
    const map = {};
    json.mods.forEach(mod => map[mod.name] = mod.enabled);
    return map;
  } catch {
    return {};
  }
}

function backupModList() {
  const realPath = getModListPath();
  if (fs.existsSync(realPath)) {
    const content = fs.readFileSync(realPath);
    fs.writeFileSync(path.join(BACKUP_DIR, 'last.json'), content);
  }
}

function saveToModList(mods) {
  // Clean mods list, ensuring 'base' is forced to true
  const clean = mods.map(m => ({
    name: m.name,
    enabled: m.name === 'base' ? true : !!m.enabled
  }));

  // Only ensure 'base' is present and enabled
  const baseExisting = clean.find(m => m.name === 'base');
  if (!baseExisting) {
    clean.unshift({ name: 'base', enabled: true });
  } else {
    baseExisting.enabled = true;
  }

  fs.writeFileSync(getModListPath(), JSON.stringify({ mods: clean }, null, 2));
  fs.writeFileSync(path.join(BACKUP_DIR, 'current.json'), JSON.stringify(clean, null, 2));
}

function findInfoJson(zip) {
  return zip.getEntries().find(e => e.entryName.endsWith('/info.json') || e.entryName === 'info.json');
}

let modZipCache = {}; // maps modName to zipPath on disk
let cachedScannedMods = null; // in-memory cache of scanned mod metadata results
let lastModDirMtime = 0; // Tracks directory modified time to auto-invalidate cache

function detectSteamFactorioPath() {
  const { execSync } = require('child_process');
  let steamPath = '';
  
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8' });
    const match = out.match(/SteamPath\\s+REG_SZ\\s+(.*)/);
    if (match) {
      steamPath = match[1].trim();
    }
  } catch (e) {
    const possiblePaths = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'D:\\SteamLibrary'
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        steamPath = p;
        break;
      }
    }
  }

  if (!steamPath) return null;

  const libraries = [steamPath];
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (fs.existsSync(vdfPath)) {
    try {
      const content = fs.readFileSync(vdfPath, 'utf-8');
      const regex = /"path"\\s+"([^"]+)"/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        const libPath = m[1].replace(/\\\\\\\\/g, '\\\\');
        if (fs.existsSync(libPath) && !libraries.includes(libPath)) {
          libraries.push(libPath);
        }
      }
    } catch (err) {
      console.warn('Failed to parse libraryfolders.vdf:', err.message);
    }
  }

  for (const lib of libraries) {
    const candidate = path.join(lib, 'steamapps', 'common', 'Factorio');
    const exePath = path.join(candidate, 'bin', 'x64', 'factorio.exe');
    if (fs.existsSync(exePath)) {
      return candidate;
    }
  }

  return null;
}

function invalidateModCache() {
  cachedScannedMods = null;
  lastModDirMtime = 0;
}

function scanMods() {
  const statusMap = readModList();

  if (!fs.existsSync(userModPath)) return [];

  let currentMtime = 0;
  try {
    currentMtime = fs.statSync(userModPath).mtimeMs;
  } catch(e) {}

  if (cachedScannedMods && lastModDirMtime === currentMtime) {
    return cachedScannedMods.map(m => ({
      ...m,
      enabled: m.type === 'core' ? true : (statusMap[m.name] ?? false)
    }));
  }

  lastModDirMtime = currentMtime;
  const files = fs.readdirSync(userModPath);
  let results = [];

  modZipCache = {};

  if (userGamePath) {
    const baseAndDLC = parseGameInfoMods(userGamePath);
    results.push(...baseAndDLC);
  }

  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    const zipPath = path.join(userModPath, file);
    try {
      const zip = new AdmZip(zipPath);
      const infoEntry = findInfoJson(zip);
      if (!infoEntry) continue;

      const infoContent = zip.readAsText(infoEntry);
      const info = JSON.parse(infoContent);
      
      // Store in cache
      modZipCache[info.name] = zipPath;

      // Check for thumbnail.png inside the zip
      const hasThumbnail = zip.getEntries().some(e => 
        e.entryName.toLowerCase().endsWith('/thumbnail.png') || 
        e.entryName.toLowerCase() === 'thumbnail.png'
      );

      results.push({
        name: info.name,
        title: info.title || info.name,
        version: info.version || '0.0.0',
        author: info.author || info.contact || 'Unknown',
        description: info.description || '(no description)',
        dependencies: info.dependencies || [],
        homepage: info.homepage || '',
        thumbnail: hasThumbnail ? `/api/mods/thumbnail/${info.name}` : null
      });
    } catch (err) {
      console.warn('Bad zip:', zipPath);
    }
  }

  function parseGameInfoMods(gamePath) {
    const names = ['base', 'elevated-rails', 'quality', 'space-age'];
    const parsed = [];

    for (const name of names) {
      const infoPath = path.join(gamePath, 'data', name, 'info.json');
      const thumbPath = path.join(gamePath, 'data', name, 'thumbnail.png');

      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        parsed.push({
          name: info.name,
          title: info.title || info.name,
          version: info.version || '0.0.0',
          author: info.author || info.contact || 'Unknown',
          description: info.description || '(no description)',
          dependencies: info.dependencies || [],
          homepage: info.homepage || '',
          type: 'core',
          thumbnail: fs.existsSync(thumbPath) ? `/game-thumbs/${name}/thumbnail.png` : null
        });
      }
    }

    return parsed;
  }

  cachedScannedMods = results;

  return results.map(m => ({
    ...m,
    enabled: m.type === 'core' ? true : (statusMap[m.name] ?? false)
  }));
}

function linkOrWarn() {
  const real = getModListPath();
  if (!fs.existsSync(real)) return { status: 'missing' };
  try {
    if (fs.existsSync(LOCAL_MOD_LIST)) fs.unlinkSync(LOCAL_MOD_LIST);
    fs.symlinkSync(real, LOCAL_MOD_LIST);
    return { status: 'linked' };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

function mergeNewMods(scanned, current) {
  const scannedMap = {};
  scanned.forEach(mod => {
    scannedMap[mod.name] = mod;
  });

  const known = new Set();
  const added = [];

  // Merge metadata from disk into existing profile items
  current.forEach(mod => {
    known.add(mod.name);
    const scannedMod = scannedMap[mod.name];
    if (scannedMod) {
      mod.title = scannedMod.title || mod.title || mod.name;
      mod.version = scannedMod.version || mod.version || '0.0.0';
      mod.author = scannedMod.author || mod.author || 'Unknown';
      mod.description = scannedMod.description || mod.description || '(no description)';
      mod.dependencies = scannedMod.dependencies || mod.dependencies || [];
      mod.thumbnail = scannedMod.thumbnail || mod.thumbnail || null;
    } else {
      if (!mod.title) mod.title = mod.name;
      if (!mod.version) mod.version = '0.0.0';
    }

    // Force base mod to always be true
    if (mod.name === 'base') {
      mod.enabled = true;
    }
  });

  // Add brand new scanned mods
  scanned.forEach(mod => {
    if (!known.has(mod.name)) {
      // Keep the scanned enabled state (e.g. true for core/DLCs), but force base to true
      const state = mod.name === 'base' ? true : !!mod.enabled;
      current.push({ ...mod, enabled: state });
      added.push(mod.title || mod.name);
    }
  });

  // Sort: core DLCs first, then all other mods alphabetically
  const coreNames = ['base', 'elevated-rails', 'quality', 'space-age'];
  current.sort((a, b) => {
    const aIndex = coreNames.indexOf(a.name);
    const bIndex = coreNames.indexOf(b.name);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    const aTitle = a.title || a.name;
    const bTitle = b.title || b.name;
    return aTitle < bTitle ? -1 : (aTitle > bTitle ? 1 : 0);
  });

  return added;
}

// === API Routes ===

app.post('/api/set-mod-path', (req, res) => {
  const { path: newPath } = req.body;
  if (fs.existsSync(newPath)) {
    userModPath = newPath;
    invalidateModCache();
    saveConfig();
    const result = linkOrWarn();
    if (result.status === 'linked') {
      res.json({ message: 'Symlink created' });
    } else if (result.status === 'missing') {
      res.status(404).json({ message: 'mod-list.json missing' });
    } else {
      res.status(500).json({ message: result.error });
    }
  } else {
    res.status(400).json({ message: 'Invalid path' });
  }
});

app.get('/api/get-mod-path', (req, res) => {
  res.json({ path: userModPath });
});

app.get('/api/check-modlist', (req, res) => {
  res.json({ exists: fs.existsSync(getModListPath()) });
});

app.get('/api/installed-mods', (req, res) => {
  const mods = scanMods();
  res.json(mods);
});


app.get('/api/profiles', (req, res) => {
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  const names = files.map(f => f.replace('.json', ''));
  res.json(names);
});

app.get('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    const data = JSON.parse(raw);
    const scanned = scanMods();
    const added = mergeNewMods(scanned, data);
    res.json(data);
  } else {
    const scanned = scanMods();
    const mods = scanned.map(m => ({ ...m, enabled: m.type === 'core' ? true : false }));
    fs.writeFileSync(file, JSON.stringify(mods, null, 2));
    res.json(mods);
  }
});

app.post('/api/profiles/:name', (req, res) => {
  const mods = req.body;
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(mods, null, 2));
  activeProfile = req.params.name;
  saveConfig();
  saveToModList(mods);
  res.sendStatus(200);
});

app.put('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(req.body || [], null, 2));
  res.sendStatus(201);
});

app.post('/api/switch/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  const mods = JSON.parse(fs.readFileSync(file));
  activeProfile = req.params.name;
  saveConfig();
  saveToModList(mods);
  res.sendStatus(200);
});

app.post('/api/rename-profile', (req, res) => {
  const { oldName, newName } = req.body;
  const oldPath = path.join(PROFILES_DIR, `${oldName}.json`);
  const newPath = path.join(PROFILES_DIR, `${newName}.json`);
  if (fs.existsSync(newPath)) return res.status(409).send('New name taken');
  
  if (!fs.existsSync(oldPath)) {
    const scanned = scanMods();
    const mods = scanned.map(m => ({ name: m.name, enabled: m.type === 'core' ? true : false }));
    fs.writeFileSync(newPath, JSON.stringify(mods, null, 2));
    return res.sendStatus(200);
  }

  fs.renameSync(oldPath, newPath);
  if (activeProfile === oldName) {
    activeProfile = newName;
    saveConfig();
  }
  res.sendStatus(200);
});

app.post('/api/delete-profile', (req, res) => {
  const { name } = req.body;
  if (!name || name === 'default') {
    return res.status(400).send('Cannot delete default profile');
  }
  const file = path.join(PROFILES_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    if (activeProfile === name) {
      activeProfile = 'default';
      saveConfig();
      const defaultFile = path.join(PROFILES_DIR, 'default.json');
      if (fs.existsSync(defaultFile)) {
        const mods = JSON.parse(fs.readFileSync(defaultFile));
        saveToModList(mods);
      }
    }
    res.sendStatus(200);
  } else {
    res.status(404).send('Profile not found');
  }
});

app.post('/api/open-mod-folder', (req, res) => {
  if (fs.existsSync(userModPath)) {
    const { exec } = require('child_process');
    exec(`start "" "${userModPath}"`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.sendStatus(200);
    });
  } else {
    res.status(404).json({ error: 'Folder does not exist' });
  }
});

app.get('/api/active-profile', (req, res) => {
  res.json({ activeProfile });
});

app.post('/api/set-game-path', (req, res) => {
  userGamePath = req.body.path;
  invalidateModCache();
  saveConfig();
  res.sendStatus(200);
});

app.post('/api/detect-steam-game', (req, res) => {
  try {
    const foundPath = detectSteamFactorioPath();
    if (foundPath) {
      userGamePath = foundPath;
      invalidateModCache();
      saveConfig();
      res.json({ success: true, path: foundPath });
    } else {
      res.json({ success: false, openUrl: 'steam://store/427520' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-game-path', (req, res) => {
  res.json({ path: userGamePath });
});

app.get('/api/mods/thumbnail/:modName', (req, res) => {
  const { modName } = req.params;
  let zipPath = modZipCache[modName];
  if (!zipPath) {
    scanMods(); // Populate cache if not loaded
    zipPath = modZipCache[modName];
  }
  
  if (!zipPath || !fs.existsSync(zipPath)) {
    return res.status(404).send('Mod zip file not found');
  }

  try {
    const zip = new AdmZip(zipPath);
    const thumbEntry = zip.getEntries().find(e => 
      e.entryName.toLowerCase().endsWith('/thumbnail.png') || 
      e.entryName.toLowerCase() === 'thumbnail.png'
    );
    if (thumbEntry) {
      const buffer = zip.readFile(thumbEntry);
      res.set('Content-Type', 'image/png');
      return res.send(buffer);
    }
  } catch (err) {
    console.error('Error reading thumbnail from zip:', err);
  }
  res.status(404).send('Thumbnail not found');
});


const { spawn } = require('child_process');
let gameProcess = null;

function syncProfileWithActualModList() {
  if (!activeProfile) return;
  const profileFile = path.join(PROFILES_DIR, `${activeProfile}.json`);
  if (!fs.existsSync(profileFile)) return;

  const actualPath = getModListPath();
  if (!fs.existsSync(actualPath)) return;

  try {
    const actualData = JSON.parse(fs.readFileSync(actualPath, 'utf-8'));
    if (!actualData || !Array.isArray(actualData.mods)) return;

    let profileMods = JSON.parse(fs.readFileSync(profileFile, 'utf-8'));
    if (!Array.isArray(profileMods)) profileMods = [];

    // Map through actual mods list and apply enabled states to profile
    actualData.mods.forEach(actualMod => {
      const profileMod = profileMods.find(m => m.name === actualMod.name);
      if (profileMod) {
        profileMod.enabled = !!actualMod.enabled;
      } else {
        profileMods.push({
          name: actualMod.name,
          enabled: !!actualMod.enabled
        });
      }
    });

    // Write back to profile JSON
    fs.writeFileSync(profileFile, JSON.stringify(profileMods, null, 2));
    console.log(`[OK] Synchronized profile "${activeProfile}" with real mod-list.json changes after game exit.`);
  } catch (err) {
    console.warn('Failed to sync profile on game exit:', err.message);
  }
}

app.post('/api/launch-game', (req, res) => {
  if (!userGamePath) {
    return res.status(400).json({ error: 'Game path not set' });
  }
  if (gameProcess) {
    return res.status(400).json({ error: 'Game is already running' });
  }

  const exePath = path.join(userGamePath, 'bin', 'x64', 'factorio.exe');
  if (!fs.existsSync(exePath)) {
    return res.status(404).json({ error: 'factorio.exe not found' });
  }

  try {
    gameProcess = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore'
    });

    gameProcess.unref();

    gameProcess.on('exit', () => {
      gameProcess = null;
      syncProfileWithActualModList();
    });

    res.json({ status: 'launched' });
  } catch (err) {
    gameProcess = null;
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/game-status', (req, res) => {
  res.json({ running: !!gameProcess });
});


// === Portal / Downloader API ===

app.get('/api/portal/search', async (req, res) => {
  try {
    const { q, page, page_size, sort, sort_order, category } = req.query;
    const data = await downloadManager.searchMods(
      q || '', parseInt(page) || 1, parseInt(page_size) || 20,
      sort || 'updated_at', sort_order || 'desc', category || ''
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to query mod portal: ' + err.message });
  }
});

app.get('/api/portal/mod/:modName', async (req, res) => {
  try {
    const data = await downloadManager.getModDetails(req.params.modName);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch mod details: ' + err.message });
  }
});

app.post('/api/portal/download', (req, res) => {
  const { modName, version, fileName, officialDownloadUrl } = req.body;
  if (!modName || !version || !fileName) {
    return res.status(400).json({ error: 'Missing modName, version, or fileName' });
  }
  const job = downloadManager.queueDownload(modName, version, fileName, officialDownloadUrl || '');
  invalidateModCache();
  res.json(job);
});

app.post('/api/portal/download-with-deps', async (req, res) => {
  const { modName, includeOptional } = req.body;
  if (!modName) return res.status(400).json({ error: 'Missing modName' });
  try {
    const plan = await downloadManager.queueWithDependencies(modName, !!includeOptional);
    invalidateModCache();
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: 'Dependency resolution failed: ' + err.message });
  }
});

app.get('/api/portal/downloads', (req, res) => {
  res.json(downloadManager.getStatus());
});

app.post('/api/portal/download-cancel/:id', (req, res) => {
  const ok = downloadManager.cancelDownload(parseInt(req.params.id));
  res.json({ success: ok });
});

app.post('/api/portal/downloads-clear', (req, res) => {
  downloadManager.clearCompleted();
  res.json({ success: true });
});

// Thumbnail proxy — avoids external URL issues in Electron
app.get('/api/portal/thumb', (req, res) => {
  const thumbPath = req.query.path;
  if (!thumbPath || !thumbPath.startsWith('/assets/')) {
    return res.status(400).send('Invalid path');
  }
  const url = `https://assets-mod.factorio.com${thumbPath}`;
  https.get(url, { headers: { 'User-Agent': 'BeltModManager/0.9.0' }, timeout: 8000 }, (proxyRes) => {
    if (proxyRes.statusCode !== 200) {
      proxyRes.resume();
      return res.status(proxyRes.statusCode).send('Not found');
    }
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    proxyRes.pipe(res);
  }).on('error', () => res.status(502).send('Proxy error'));
});

// Auth credential management
app.get('/api/portal/auth-status', (req, res) => {
  const creds = credStore.loadCredentials();
  res.json({ authenticated: !!creds, username: creds ? creds.username : null });
});

app.post('/api/portal/auth-save', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  // Authenticate with Factorio servers to obtain a service token
  try {
    const postData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&require_game_ownership=true&api_version=2`;
    const token = await new Promise((resolve, reject) => {
      const postReq = https.request({
        hostname: 'auth.factorio.com',
        path: '/api-login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'BeltModManager/0.9.1'
        },
        timeout: 15000
      }, (authRes) => {
        let body = '';
        authRes.on('data', chunk => body += chunk);
        authRes.on('end', () => {
          if (authRes.statusCode === 200) {
            try {
              const parsed = JSON.parse(body);
              if (parsed[0]) resolve(parsed[0]);
              else reject(new Error('No token returned'));
            } catch { reject(new Error('Invalid response from auth server')); }
          } else if (authRes.statusCode === 401) {
            reject(new Error('Invalid username or password'));
          } else {
            reject(new Error(`Auth server returned ${authRes.statusCode}`));
          }
        });
      });
      postReq.on('error', reject);
      postReq.on('timeout', () => { postReq.destroy(); reject(new Error('Auth server timeout')); });
      postReq.write(postData);
      postReq.end();
    });
    credStore.saveCredentials(username, token);
    res.json({ success: true, username });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/portal/auth-clear', (req, res) => {
  credStore.clearCredentials();
  res.json({ success: true });
});


// === Start ===
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    backupModList();
    const result = linkOrWarn();
    if (result.status === 'linked') {
      console.log('[OK] Symlink created from /mod-list/mod-list.json -> user mod path');
    } else if (result.status === 'missing') {
      console.warn('[x] mod-list.json not found in selected path');
    }
    
    // Warm up the in-memory scanned mods cache on startup
    console.log('Pre-scanning mods to warm up metadata cache...');
    scanMods();
    console.log('Mod metadata cache warmed successfully!');
    
    console.log(`Mod Manager running at http://localhost:${PORT}`);
  });
}

module.exports = app;
