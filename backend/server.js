// Copyright (c) 2026 Kraid | Tathagata S. under Kivx.in. Licensed under the MIT License.
const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { DownloadManager } = require('./download-manager');
const credStore = require('./credential-store');
const https = require('https');
const { Worker } = require('worker_threads');
const ejs = require('ejs');

const app = express();
const isDev = process.argv.includes('--dev');
const PORT = process.env.NODE_ENV === 'test' 
  ? 0 
  : (isDev ? 14155 : Number.parseInt(process.env.BELTMM_PORT || '0', 10));
const HOST = '127.0.0.1';
const SERVER_START_MS = Date.now();

const MODS_DIR_DEFAULT = path.join(process.env.APPDATA || '', 'Factorio', 'mods');
let userModPath = MODS_DIR_DEFAULT;
let userGamePath = ''; // global
let activeProfile = 'default';
let uiScale = 85;
let gameArgs = '';
let maxConcurrent = 3;
let enableSoundEffects = true;
let soundVolume = 80;
let enableBackgroundAnimation = false;

const CONFIG_FILE = path.join(__dirname, 'config.json');
const METADATA_CACHE_FILE = process.env.NODE_ENV === 'test' 
  ? path.join(__dirname, '..', '.cache', 'test-metadata-cache.json') 
  : path.join(__dirname, '..', '.cache', 'mod-metadata-cache.json');

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
      if (config.uiScale !== undefined) {
        uiScale = config.uiScale;
      }
      if (config.gameArgs !== undefined) {
        gameArgs = config.gameArgs;
      }
      if (config.maxConcurrent !== undefined) {
        maxConcurrent = config.maxConcurrent;
      }
      if (config.enableSoundEffects !== undefined) {
        enableSoundEffects = config.enableSoundEffects;
      }
      if (config.soundVolume !== undefined) {
        soundVolume = config.soundVolume;
      }
      if (config.enableBackgroundAnimation !== undefined) {
        enableBackgroundAnimation = config.enableBackgroundAnimation;
      }
    }
  } catch (err) {
    console.warn('Could not load config.json:', err.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ 
      userModPath, 
      userGamePath, 
      activeProfile,
      uiScale,
      gameArgs,
      maxConcurrent,
      enableSoundEffects,
      soundVolume,
      enableBackgroundAnimation
    }, null, 2));
  } catch (err) {
    console.warn('Could not save config.json:', err.message);
  }
}

// Load config immediately
loadConfig();

// === Download Manager (singleton) ===
const downloadManager = new DownloadManager(() => userModPath);
downloadManager.maxConcurrent = maxConcurrent;

function addDownloadedModToActiveProfile(modName) {
  if (!activeProfile) return;
  const profileFile = path.join(PROFILES_DIR, `${activeProfile}.json`);
  if (!fs.existsSync(profileFile)) return;
  try {
    const profileMods = JSON.parse(fs.readFileSync(profileFile, 'utf-8'));
    if (!Array.isArray(profileMods)) return;
    
    const existing = profileMods.find(m => m.name === modName);
    if (!existing) {
      profileMods.push({
        name: modName,
        enabled: false
      });
      fs.writeFileSync(profileFile, JSON.stringify(profileMods, null, 2));
      saveToModList(profileMods);
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[Item 5 Fix] Added downloaded mod "${modName}" as disabled to active profile "${activeProfile}" and mod-list.json.`);
      }
    }
  } catch (err) {
    console.warn('[Item 5 Fix] Failed to add downloaded mod to active profile:', err.message);
  }
}

downloadManager.onJobComplete = (job) => {
  invalidateModCache();
  if (job && job.modName) {
    addDownloadedModToActiveProfile(job.modName);
  }
  startBackgroundModScan('download-complete');
};

const BACKUP_DIR = process.env.NODE_ENV === 'test' ? path.join(__dirname, '..', 'test-backup') : path.join(__dirname, '..', 'backup');
const PROFILES_DIR = process.env.NODE_ENV === 'test' ? path.join(__dirname, '..', 'test-profiles') : path.join(__dirname, '..', 'profiles');
const LOCAL_MOD_LIST = process.env.NODE_ENV === 'test' ? path.join(__dirname, '..', 'test-mod-list', 'mod-list.json') : path.join(__dirname, '..', 'mod-list', 'mod-list.json');

// === Ensure folders ===
fse.ensureDirSync(PROFILES_DIR);
fse.ensureDirSync(BACKUP_DIR);
fse.ensureDirSync(path.dirname(LOCAL_MOD_LIST));
fse.ensureDirSync(path.dirname(METADATA_CACHE_FILE));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/Assets', express.static(path.join(__dirname, '..', 'Assets')));
app.use('/js/vue.js', express.static(path.join(__dirname, '..', 'node_modules/vue/dist/vue.min.js')));
app.use(express.json({ limit: '20mb' }));
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// === Serve index ===
app.get('/', (req, res) => res.render('index'));

app.get('/game-thumbs/*', (req, res) => {
  if (!userGamePath) return res.status(404).send('Game path not set');
  const relativePath = req.params[0];
  const baseDir = path.resolve(userGamePath, 'data');
  const fullPath = path.resolve(baseDir, relativePath || '');
  if (!fullPath.startsWith(baseDir + path.sep)) {
    return res.status(400).send('Invalid path');
  }
  if (!fullPath.toLowerCase().endsWith('.png')) {
    return res.status(400).send('Invalid file type');
  }
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

function isSafeProfileName(name) {
  if (typeof name !== 'string') return false;
  if (!name || name.length > 64) return false;

  // Fully decode percent-encoded characters recursively to prevent nested URL encoding bypasses
  let decoded = name;
  let prev = '';
  while (decoded !== prev) {
    prev = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch (e) {
      try {
        decoded = unescape(decoded);
      } catch (err) {
        return false; // Reject malformed encodings
      }
    }
  }

  // Must not contain Windows forbidden characters, null bytes, or path traversal indicators
  if (decoded.includes('\0') || /[\\/:*?"<>|]/.test(decoded) || decoded.includes('..')) return false;

  // Must not start or end with spaces or dots (Windows automatically trims these)
  if (decoded.startsWith(' ') || decoded.endsWith(' ') || decoded.startsWith('.') || decoded.endsWith('.')) return false;

  // Block Windows reserved names (CON, AUX, PRN, NUL, COM1-9, LPT1-9)
  const baseName = decoded.split('.')[0].toUpperCase();
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;
  if (reserved.test(baseName)) return false;

  return true;
}

function readModList() {
  try {
    const file = fs.readFileSync(getModListPath(), 'utf-8');
    const json = JSON.parse(file);
    const map = {};
    if (!json || !Array.isArray(json.mods)) return {};
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
let modScanInFlight = false;
let pendingScanResolvers = [];

function getScannedMods(reason = 'unknown') {
  if (cachedScannedMods) {
    return Promise.resolve(cachedScannedMods);
  }
  if (process.env.NODE_ENV === 'test') {
    cachedScannedMods = scanMods();
    return Promise.resolve(cachedScannedMods);
  }
  return new Promise((resolve) => {
    pendingScanResolvers.push(resolve);
    if (!modScanInFlight) {
      startBackgroundModScan(reason);
    }
  });
}

function startBackgroundModScan(reason = 'unknown') {
  if (modScanInFlight) return;
  modScanInFlight = true;
  const scanStart = Date.now();

  const workerPath = path.join(__dirname, 'mod-scan-worker.js');
  const modsDir = userModPath;
  const gamePath = userGamePath;

  const worker = new Worker(workerPath, { workerData: { modsDir, gamePath, cacheFilePath: METADATA_CACHE_FILE } });

  worker.once('message', (msg) => {
    if (msg && msg.ok) {
      cachedScannedMods = Array.isArray(msg.results) ? msg.results : [];
      modZipCache = msg.modZipCache && typeof msg.modZipCache === 'object' ? msg.modZipCache : {};
      lastModDirMtime = typeof msg.modDirMtime === 'number' ? msg.modDirMtime : 0;
      if (process.env.NODE_ENV !== 'test') {
        console.log(
          `[Perf] Mod scan (${reason}) completed in ${Date.now() - scanStart}ms (${cachedScannedMods.length} mods)`
        );
      }
    } else {
      console.warn(`[ModScan] Worker scan failed (${reason}):`, msg && msg.error ? msg.error : 'unknown error');
    }
  });

  worker.once('error', (err) => {
    console.warn(`[ModScan] Worker error (${reason}):`, err.message);
  });

  worker.once('exit', () => {
    modScanInFlight = false;
    // Resolve all waiting requests with the newly scanned mods
    const resolvers = pendingScanResolvers;
    pendingScanResolvers = [];
    resolvers.forEach(resolve => resolve(cachedScannedMods || []));
  });
}

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

  // Load persistent metadata cache
  let persistentCache = {};
  try {
    if (fs.existsSync(METADATA_CACHE_FILE)) {
      persistentCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf-8'));
    }
  } catch {}

  let cacheUpdated = false;

  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    const zipPath = path.join(userModPath, file);
    try {
      const stats = fs.statSync(zipPath);
      const cacheKey = file;

      if (persistentCache[cacheKey] && 
          persistentCache[cacheKey].mtime === stats.mtimeMs && 
          persistentCache[cacheKey].size === stats.size) {
        const cached = persistentCache[cacheKey].metadata;
        results.push({
          name: cached.name,
          title: cached.title,
          version: cached.version,
          author: cached.author,
          description: cached.description,
          dependencies: cached.dependencies,
          homepage: cached.homepage,
          thumbnail: cached.hasThumbnail ? `/api/mods/thumbnail/${cached.name}` : null,
          mtime: stats.mtimeMs,
          _zipPath: zipPath,
        });
        continue;
      }

      // Cache miss: parse the ZIP file
      const zip = new AdmZip(zipPath);
      const infoEntry = findInfoJson(zip);
      if (!infoEntry) continue;

      const infoContent = zip.readAsText(infoEntry);
      const info = JSON.parse(infoContent);

      const hasThumbnail = zip.getEntries().some(e => 
        e.entryName.toLowerCase().endsWith('/thumbnail.png') || 
        e.entryName.toLowerCase() === 'thumbnail.png'
      );

      const metadata = {
        name: info.name,
        title: info.title || info.name,
        version: info.version || '0.0.0',
        author: info.author || info.contact || 'Unknown',
        description: info.description || '(no description)',
        dependencies: info.dependencies || [],
        homepage: info.homepage || '',
        hasThumbnail,
      };

      persistentCache[cacheKey] = {
        mtime: stats.mtimeMs,
        size: stats.size,
        metadata,
      };
      cacheUpdated = true;

      results.push({
        ...metadata,
        thumbnail: hasThumbnail ? `/api/mods/thumbnail/${info.name}` : null,
        mtime: stats.mtimeMs,
        _zipPath: zipPath,
      });
    } catch (err) {
      console.warn('Bad zip:', zipPath);
    }
  }

  // Save updated cache
  if (cacheUpdated) {
    try {
      fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(persistentCache, null, 2), 'utf-8');
    } catch {}
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
          thumbnail: fs.existsSync(thumbPath) ? `/game-thumbs/${name}/thumbnail.png` : null,
          mtime: 0
        });
      }
    }

    return parsed;
  }

  // Deduplicate and only keep highest semantic version of each mod
  const grouped = {};
  for (const m of results) {
    if (!grouped[m.name]) {
      grouped[m.name] = [];
    }
    grouped[m.name].push(m);
  }

  const dedupedResults = [];
  const finalModZipCache = {};

  for (const [name, list] of Object.entries(grouped)) {
    let selected;
    if (list.length === 1) {
      selected = list[0];
    } else {
      list.sort((a, b) => {
        const partsA = (a.version || '0.0.0').split('.').map(x => parseInt(x) || 0);
        const partsB = (b.version || '0.0.0').split('.').map(x => parseInt(x) || 0);
        const maxLen = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < maxLen; i++) {
          const pa = partsA[i] || 0;
          const pb = partsB[i] || 0;
          if (pb !== pa) return pb - pa;
        }
        return (b.mtime || 0) - (a.mtime || 0);
      });
      selected = list[0];
    }

    if (selected._zipPath) {
      finalModZipCache[name] = selected._zipPath;
    }
    delete selected._zipPath;
    dedupedResults.push(selected);
  }

  results = dedupedResults;
  modZipCache = finalModZipCache;
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
  let changed = false;

  // Merge metadata from disk into existing profile items
  current.forEach(mod => {
    known.add(mod.name);
    const scannedMod = scannedMap[mod.name];
    if (scannedMod) {
      if (mod.title !== scannedMod.title || mod.version !== scannedMod.version || mod.author !== scannedMod.author) {
        mod.title = scannedMod.title || mod.title || mod.name;
        mod.version = scannedMod.version || mod.version || '0.0.0';
        mod.author = scannedMod.author || mod.author || 'Unknown';
        mod.description = scannedMod.description || mod.description || '(no description)';
        mod.dependencies = scannedMod.dependencies || mod.dependencies || [];
        mod.thumbnail = scannedMod.thumbnail || mod.thumbnail || null;
        changed = true;
      }
    } else {
      if (!mod.title) { mod.title = mod.name; changed = true; }
      if (!mod.version) { mod.version = '0.0.0'; changed = true; }
    }

    // Force base mod to always be true
    if (mod.name === 'base' && !mod.enabled) {
      mod.enabled = true;
      changed = true;
    }
  });

  // Add brand new scanned mods
  scanned.forEach(mod => {
    if (!known.has(mod.name)) {
      known.add(mod.name);
      // Keep the scanned enabled state (e.g. true for core/DLCs), but force base to true
      const state = mod.name === 'base' ? true : !!mod.enabled;
      current.push({ ...mod, enabled: state });
      added.push(mod.title || mod.name);
      changed = true;
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
    const aTitle = (a.title || a.name).toLowerCase();
    const bTitle = (b.title || b.name).toLowerCase();
    return aTitle < bTitle ? -1 : (aTitle > bTitle ? 1 : 0);
  });

  return changed;
}

// === API Routes ===

app.post('/api/set-mod-path', (req, res) => {
  const { path: newPath } = req.body;
  if (fs.existsSync(newPath)) {
    userModPath = newPath;
    invalidateModCache();
    startBackgroundModScan('set-mod-path');
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

app.get('/api/installed-mods', async (req, res) => {
  try {
    const scanned = await getScannedMods('installed-mods-request');
    const statusMap = readModList();
    res.json(
      scanned.map((m) => ({
        ...m,
        enabled: m.type === 'core' ? true : (statusMap[m.name] ?? false),
      }))
    );
  } catch (err) {
    res.status(500).send(err.message);
  }
});


app.get('/api/profiles', (req, res) => {
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  const names = files.map(f => f.replace('.json', ''));
  res.json(names);
});

app.get('/api/profiles/:name', (req, res) => {
  const profileName = req.params.name;
  if (!isSafeProfileName(profileName)) return res.status(400).send('Invalid profile name');
  const file = path.join(PROFILES_DIR, `${profileName}.json`);
  if (fs.existsSync(file)) {
    try {
      const scanned = scanMods();
      const mods = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(mods)) return res.status(500).json({ error: 'Profile file is not a mod list array' });

      const changed = mergeNewMods(scanned, mods);
      if (changed) {
        fs.writeFileSync(file, JSON.stringify(mods, null, 2));
        console.log(`[OK] Auto-enriched and saved profile: ${profileName}`);
      }
      // it was that easy? 🗿
      res.json(mods);
    } catch (err) {
      return res.status(400).send('Profile file is corrupted JSON');
    }
  } else {
    const scanned = scanMods();
    const mods = scanned.map(m => ({ ...m, enabled: m.type === 'core' ? true : false }));
    fs.writeFileSync(file, JSON.stringify(mods, null, 2));
    res.json(mods);
  }
});

app.post('/api/profiles/:name', (req, res) => {
  const profileName = req.params.name;
  if (!isSafeProfileName(profileName)) return res.status(400).send('Invalid profile name');
  const mods = req.body;
  
  if (!Array.isArray(mods)) {
    return res.status(400).send('Profile payload must be an array');
  }

  const seenNames = new Set();
  for (const mod of mods) {
    if (!mod || typeof mod.name !== 'string' || typeof mod.enabled !== 'boolean') {
      return res.status(400).send('Malformed mod entry inside profile arrays');
    }
    if (seenNames.has(mod.name)) {
      return res.status(400).send('Duplicate mod names in a profile payload');
    }
    seenNames.add(mod.name);
  }

  const file = path.join(PROFILES_DIR, `${profileName}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(mods, null, 2));
    activeProfile = profileName;
    saveConfig();
    saveToModList(mods);
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/profiles/:name', (req, res) => {
  const profileName = req.params.name;
  if (!isSafeProfileName(profileName)) return res.status(400).send('Invalid profile name');
  const file = path.join(PROFILES_DIR, `${profileName}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(req.body || [], null, 2));
    res.sendStatus(201);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/switch/:name', (req, res) => {
  const profileName = req.params.name;
  if (!isSafeProfileName(profileName)) return res.status(400).send('Invalid profile name');
  const file = path.join(PROFILES_DIR, `${profileName}.json`);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  try {
    const mods = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(mods)) return res.status(500).send('Profile file is invalid');
    activeProfile = profileName;
    saveConfig();
    saveToModList(mods);
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rename-profile', (req, res) => {
  const { oldName, newName } = req.body;
  if (!isSafeProfileName(oldName) || !isSafeProfileName(newName)) {
    return res.status(400).send('Invalid profile name');
  }
  const oldPath = path.join(PROFILES_DIR, `${oldName}.json`);
  const newPath = path.join(PROFILES_DIR, `${newName}.json`);
  if (fs.existsSync(newPath)) return res.status(409).send('New name taken');
  
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/delete-profile', (req, res) => {
  const { name } = req.body;
  if (!isSafeProfileName(name)) {
    return res.status(400).send('Invalid profile name');
  }
  if (!name || name === 'default') {
    return res.status(400).send('Cannot delete default profile');
  }
  const file = path.join(PROFILES_DIR, `${name}.json`);
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      if (activeProfile === name) {
        activeProfile = 'default';
        saveConfig();
        const defaultFile = path.join(PROFILES_DIR, 'default.json');
        if (fs.existsSync(defaultFile)) {
          const mods = JSON.parse(fs.readFileSync(defaultFile, 'utf-8'));
          if (!Array.isArray(mods)) return res.status(500).send('Default profile is invalid');
          saveToModList(mods);
        }
      }
      res.sendStatus(200);
    } else {
      res.status(404).send('Profile not found');
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/delete-mod', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).send('Mod name is required');
  }
  if (['base', 'elevated-rails', 'quality', 'space-age'].includes(name)) {
    return res.status(400).send('Cannot delete core game mods');
  }

  const zipPath = modZipCache[name];
  if (zipPath && fs.existsSync(zipPath)) {
    try {
      fs.unlinkSync(zipPath);
      invalidateModCache();
      res.sendStatus(200);
    } catch (err) {
      res.status(500).send('Failed to delete mod file: ' + err.message);
    }
  } else {
    res.status(404).send('Mod file not found');
  }
});

app.post('/api/delete-mod-with-deps', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).send('Mod name is required');
  }
  const coreMods = ['base', 'elevated-rails', 'quality', 'space-age'];
  if (coreMods.includes(name)) {
    return res.status(400).send('Cannot delete core game mods');
  }

  if (!cachedScannedMods) {
    scanMods();
  }

  const allMods = cachedScannedMods || [];
  const targetMod = allMods.find(m => m.name === name);
  if (!targetMod) {
    return res.status(404).send('Mod not found');
  }

  function getDepCleanName(depStr) {
    let s = depStr.trim();
    if (s.startsWith('(?)')) s = s.slice(3).trim();
    else if (s.startsWith('?')) s = s.slice(1).trim();
    else if (s.startsWith('(!)')) s = s.slice(3).trim();
    else if (s.startsWith('!')) s = s.slice(1).trim();
    else if (s.startsWith('~')) s = s.slice(1).trim();
    return s.split(/\s+/)[0];
  }

  const modsToDelete = new Set([name]);
  const queue = [name];

  while (queue.length > 0) {
    const currentName = queue.shift();
    const currentMod = allMods.find(m => m.name === currentName);
    if (!currentMod) continue;

    const currentDeps = (currentMod.dependencies || [])
      .map(d => getDepCleanName(d))
      .filter(n => n && !coreMods.includes(n));

    currentDeps.forEach(depName => {
      const depMod = allMods.find(m => m.name === depName);
      if (depMod && !modsToDelete.has(depName)) {
        let isNeededByOthers = false;
        for (const mod of allMods) {
          if (modsToDelete.has(mod.name)) continue;
          const modDeps = (mod.dependencies || []).map(d => getDepCleanName(d));
          if (modDeps.includes(depName)) {
            isNeededByOthers = true;
            break;
          }
        }

        if (!isNeededByOthers) {
          modsToDelete.add(depName);
          queue.push(depName);
        }
      }
    });
  }

  const deleted = [];
  const errors = [];

  for (const modName of modsToDelete) {
    if (coreMods.includes(modName)) continue;
    const zipPath = modZipCache[modName];
    if (zipPath && fs.existsSync(zipPath)) {
      try {
        fs.unlinkSync(zipPath);
        deleted.push(modName);
      } catch (err) {
        errors.push(`${modName}: ${err.message}`);
      }
    }
  }

  invalidateModCache();

  if (errors.length > 0) {
    res.status(207).json({ deleted, errors });
  } else {
    res.status(200).json({ deleted });
  }
});

app.post('/api/open-mod-folder', (req, res) => {
  if (fs.existsSync(userModPath)) {
    const { spawn } = require('child_process');
    try {
      const child = spawn('explorer.exe', [userModPath], { windowsHide: false, shell: false });
      child.on('error', (err) => res.status(500).json({ error: err.message }));
      child.on('spawn', () => res.sendStatus(200));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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
  startBackgroundModScan('set-game-path');
  saveConfig();
  res.sendStatus(200);
});

app.post('/api/detect-steam-game', (req, res) => {
  try {
    const foundPath = detectSteamFactorioPath();
    if (foundPath) {
      userGamePath = foundPath;
      invalidateModCache();
      startBackgroundModScan('detect-steam-game');
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
    const scanned = scanMods();
    mergeNewMods(scanned, profileMods);
    fs.writeFileSync(profileFile, JSON.stringify(profileMods, null, 2));
    console.log(`[OK] Synchronized profile "${activeProfile}" with real mod-list.json changes after game exit.`);
  } catch (err) {
    console.warn('Failed to sync profile on game exit:', err.message);
  }
}

function preLaunchModListSync() {
  if (!userModPath || !fs.existsSync(userModPath)) return;
  const listPath = getModListPath();
  if (!fs.existsSync(listPath)) return;

  try {
    const files = fs.readdirSync(userModPath);
    const modFiles = files.filter(f => f.endsWith('.zip') || fs.statSync(path.join(userModPath, f)).isDirectory());
    
    // Use the cached metadata if available, otherwise do a quick disk scan
    let scanned = cachedScannedMods;
    if (!scanned) {
      scanned = [];
      for (const file of modFiles) {
        if (file.endsWith('.zip')) {
          try {
            const zip = new AdmZip(path.join(userModPath, file));
            const infoEntry = zip.getEntries().find(e => e.entryName.endsWith('info.json'));
            if (infoEntry) {
              const info = JSON.parse(zip.readAsText(infoEntry));
              if (info.name) scanned.push({ name: info.name });
            }
          } catch {}
        } else {
          const infoPath = path.join(userModPath, file, 'info.json');
          if (fs.existsSync(infoPath)) {
            try {
              const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
              if (info.name) scanned.push({ name: info.name });
            } catch {}
          }
        }
      }
    }

    const data = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
    if (!data || !Array.isArray(data.mods)) return;

    let changed = false;
    for (const s of scanned) {
      if (['base', 'elevated-rails', 'quality', 'space-age'].includes(s.name)) continue;
      
      const exists = data.mods.find(m => m.name === s.name);
      if (!exists) {
        data.mods.push({ name: s.name, enabled: false });
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(listPath, JSON.stringify(data, null, 2));
      console.log('[OK] Pre-launch sync: Added missing mods to mod-list.json as disabled.');
    }
  } catch (err) {
    console.error('Failed to perform pre-launch sync:', err);
  }
}

app.get('/api/config', (req, res) => {
  res.json({
    userModPath,
    userGamePath,
    activeProfile,
    uiScale,
    gameArgs,
    maxConcurrent,
    enableSoundEffects,
    soundVolume,
    enableBackgroundAnimation
  });
});

app.post('/api/config', (req, res) => {
  const { 
    userModPath: newModPath, 
    userGamePath: newGamePath, 
    activeProfile: newProfile, 
    uiScale: newScale,
    gameArgs: newArgs,
    maxConcurrent: newMaxConcurrent,
    enableSoundEffects: newEnableSound,
    soundVolume: newVolume,
    enableBackgroundAnimation: newEnableBgAnimate
  } = req.body;

  if (newModPath !== undefined && newModPath !== userModPath) {
    userModPath = newModPath;
    invalidateModCache();
    startBackgroundModScan('config-update-mods');
  }
  if (newGamePath !== undefined && newGamePath !== userGamePath) {
    userGamePath = newGamePath;
    invalidateModCache();
    startBackgroundModScan('config-update-game');
  }
  if (newProfile !== undefined) activeProfile = newProfile;
  if (newScale !== undefined && typeof newScale === 'number') uiScale = newScale;
  if (newArgs !== undefined && typeof newArgs === 'string') gameArgs = newArgs;
  if (newMaxConcurrent !== undefined && typeof newMaxConcurrent === 'number') {
    maxConcurrent = newMaxConcurrent;
    downloadManager.maxConcurrent = maxConcurrent;
  }
  if (newEnableSound !== undefined && typeof newEnableSound === 'boolean') {
    enableSoundEffects = newEnableSound;
  }
  if (newVolume !== undefined && typeof newVolume === 'number') {
    soundVolume = newVolume;
  }
  if (newEnableBgAnimate !== undefined && typeof newEnableBgAnimate === 'boolean') {
    enableBackgroundAnimation = newEnableBgAnimate;
  }

  saveConfig();
  res.json({
    userModPath,
    userGamePath,
    activeProfile,
    uiScale,
    gameArgs,
    maxConcurrent,
    enableSoundEffects,
    soundVolume,
    enableBackgroundAnimation
  });
});

app.get('/api/mods/check-updates', async (req, res) => {
  try {
    const scanned = await getScannedMods('check-updates');
    const nonCoreMods = scanned.filter(m => m.type !== 'core');
    if (nonCoreMods.length === 0) {
      return res.json({});
    }

    const names = nonCoreMods.map(m => m.name).join(',');
    const url = `https://mods.factorio.com/api/mods?namelist=${encodeURIComponent(names)}`;
    
    const { fetchJson } = require('./download-manager');
    const data = await fetchJson(url);
    
    function isNewerVersion(v1, v2) {
      const parts1 = (v1 || '0.0.0').split('.').map(x => parseInt(x) || 0);
      const parts2 = (v2 || '0.0.0').split('.').map(x => parseInt(x) || 0);
      const maxLen = Math.max(parts1.length, parts2.length);
      for (let i = 0; i < maxLen; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p2 > p1) return true;
        if (p1 > p2) return false;
      }
      return false;
    }

    const updates = {};
    if (data && Array.isArray(data.results)) {
      data.results.forEach(m => {
        const lr = m.latest_release || (m.releases ? m.releases[m.releases.length - 1] : null);
        if (lr) {
          const installed = nonCoreMods.find(inst => inst.name === m.name);
          if (installed && isNewerVersion(installed.version, lr.version)) {
            updates[m.name] = lr.version;
          }
        }
      });
    }
    res.json(updates);
  } catch (err) {
    res.status(502).json({ error: 'Failed to check updates: ' + err.message });
  }
});

app.post('/api/launch-game', (req, res) => {
  if (!userGamePath) {
    return res.status(400).json({ error: 'Game path not set' });
  }
  if (gameProcess) {
    return res.status(400).json({ error: 'Game is already running' });
  }

  // Ensure mod-list.json is synced with all disk files (as disabled) before launch
  preLaunchModListSync();

  const exePath = path.join(userGamePath, 'bin', 'x64', 'factorio.exe');
  if (!fs.existsSync(exePath)) {
    return res.status(404).json({ error: 'factorio.exe not found' });
  }

  try {
    const args = gameArgs && gameArgs.trim() ? gameArgs.trim().split(/\s+/) : [];
    gameProcess = spawn(exePath, args, {
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
    const { q, page, page_size, sort, category, tag, version, include_deprecated, space_age } = req.query;
    const data = await downloadManager.searchMods(
      q || '',
      parseInt(page) || 1,
      parseInt(page_size) || 20,
      sort || 'updated_at',
      category || '',
      tag || '',
      version || '2.0',
      include_deprecated === 'true',
      space_age || 'any'
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
  startBackgroundModScan('portal-download');
  res.json(job);
});

app.post('/api/portal/download-with-deps', async (req, res) => {
  const { modName, includeOptional } = req.body;
  if (!modName) return res.status(400).json({ error: 'Missing modName' });
  try {
    const plan = await downloadManager.queueWithDependencies(modName, !!includeOptional);
    invalidateModCache();
    startBackgroundModScan('portal-download-with-deps');
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: 'Dependency resolution failed: ' + err.message });
  }
});

app.get('/api/portal/downloads', (req, res) => {
  res.json(downloadManager.getStatus());
});

app.post('/api/portal/download-cancel/:id', (req, res) => {
  const idNum = parseInt(req.params.id);
  if (isNaN(idNum)) {
    return res.status(400).send('Download ID must be a number');
  }
  const ok = downloadManager.cancelDownload(idNum);
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
let httpServer = null;
let _resolveReady;
let boundPort = PORT;

const whenReady =
  process.env.NODE_ENV === 'test'
    ? Promise.resolve({ host: HOST, port: null })
    : new Promise((resolve) => {
        _resolveReady = resolve;
      });

if (process.env.NODE_ENV !== 'test') {
  const startServer = (tryPort) => {
    httpServer = app.listen(tryPort, HOST, () => {
      boundPort = httpServer.address().port;
      console.log(`[Perf] Server listen ready in ${Date.now() - SERVER_START_MS}ms on port ${boundPort}`);
      backupModList();
      const result = linkOrWarn();
      if (result.status === 'linked') {
        console.log('[OK] Symlink created from /mod-list/mod-list.json -> user mod path');
      } else if (result.status === 'missing') {
        console.warn('[x] mod-list.json not found in selected path');
      }

      // Warm up mod metadata cache without blocking startup.
      console.log('Starting background mod scan to warm metadata cache...');
      startBackgroundModScan('startup');

      console.log(`Mod Manager running at http://${HOST}:${boundPort}`);
      if (_resolveReady) _resolveReady({ host: HOST, port: boundPort });
    });

    httpServer.on('error', (err) => {
      if (tryPort !== 0) {
        console.warn(`[Warning] Failed to listen on port ${tryPort} (${err.code}). Retrying with an ephemeral port...`);
        startServer(0);
      } else {
        console.error('[Fatal] Failed to bind to ephemeral port:', err);
      }
    });
  };

  startServer(PORT);
}

module.exports = {
  app,
  whenReady,
  getServerInfo: () => ({ host: HOST, port: boundPort }),
  getHttpServer: () => httpServer,
  downloadManager,
  invalidateModCache,
  isCacheCleared: () => cachedScannedMods === null,
  isSafeProfileName,
};
