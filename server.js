const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = 3000;

const MODS_DIR_DEFAULT = path.join(process.env.APPDATA || '', 'Factorio', 'mods');
let userModPath = MODS_DIR_DEFAULT;
let userGamePath = ''; // global


const BACKUP_DIR = path.join(__dirname, 'backup');
const PROFILES_DIR = path.join(__dirname, 'profiles');
const LOCAL_MOD_LIST = path.join(__dirname, 'mod-list', 'mod-list.json');

// === Ensure folders ===
fse.ensureDirSync(PROFILES_DIR);
fse.ensureDirSync(BACKUP_DIR);
fse.ensureDirSync(path.dirname(LOCAL_MOD_LIST));

app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// === Serve index ===
app.get('/', (req, res) => res.render('index'));

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
  const required = ['base', 'elevated-rails', 'quality', 'space-age'];
  const clean = mods.map(m => ({ name: m.name, enabled: m.enabled }));
  required.forEach(name => {
    if (!clean.some(m => m.name === name)) {
      clean.unshift({ name, enabled: true });
    }
  });

  fs.writeFileSync(getModListPath(), JSON.stringify({ mods: clean }, null, 2));
  fs.writeFileSync(path.join(BACKUP_DIR, 'current.json'), JSON.stringify(clean, null, 2));
}

function findInfoJson(zip) {
  return zip.getEntries().find(e => e.entryName.endsWith('/info.json') || e.entryName === 'info.json');
}

function scanMods() {
  const files = fs.readdirSync(userModPath);
  const statusMap = readModList();
  const results = [];

  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    const zipPath = path.join(userModPath, file);
    try {
      const zip = new AdmZip(zipPath);
      const infoEntry = findInfoJson(zip);
      if (!infoEntry) continue;

      const infoContent = zip.readAsText(infoEntry);
      const info = JSON.parse(infoContent);
      results.push({
        name: info.name,
        title: info.title || info.name,
        version: info.version || '0.0.0',
        enabled: statusMap[info.name] ?? false
      });
    } catch (err) {
      console.warn('Bad zip:', zipPath);
    }
  }

  if (userGamePath) {
    const dlcs = ['base', 'elevated-rails', 'quality', 'space-age'];
    for (const dlc of dlcs) {
      const infoPath = path.join(userGamePath, 'data', dlc, 'info.json');
      const thumbPath = path.join(userGamePath, 'data', dlc, 'thumbnail.png');
      if (!fs.existsSync(infoPath)) continue;
    
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
      results.push({
        name: info.name,
        title: info.title || info.name,
        version: info.version || '0.0.0',
        author: info.author || '',
        description: info.description || '',
        source: 'dlc',
        thumbnail: fs.existsSync(thumbPath) ? thumbPath : null,
        enabled: true
      });
    }
  }


  return results;
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
  const known = new Set(current.map(m => m.name));
  const added = [];

  scanned.forEach(mod => {
    if (!known.has(mod.name)) {
      current.push({ ...mod, enabled: false });
      added.push(mod.title || mod.name);
    }
  });

  return added;
}

// === API Routes ===

app.post('/api/set-mod-path', (req, res) => {
  const { path: newPath } = req.body;
  if (fs.existsSync(newPath)) {
    userModPath = newPath;
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
    const mods = scanned.map(m => ({ ...m, enabled: false }));
    fs.writeFileSync(file, JSON.stringify(mods, null, 2));
    res.json(mods);
  }
});

app.post('/api/profiles/:name', (req, res) => {
  const mods = req.body;
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(mods, null, 2));
  saveToModList(mods);
  res.sendStatus(200);
});

app.post('/api/switch/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  const mods = JSON.parse(fs.readFileSync(file));
  saveToModList(mods);
  res.sendStatus(200);
});

app.post('/api/rename-profile', (req, res) => {
  const { oldName, newName } = req.body;
  const oldPath = path.join(PROFILES_DIR, `${oldName}.json`);
  const newPath = path.join(PROFILES_DIR, `${newName}.json`);
  if (!fs.existsSync(oldPath)) return res.status(404).send('Old profile missing');
  if (fs.existsSync(newPath)) return res.status(409).send('New name taken');
  fs.renameSync(oldPath, newPath);
  res.sendStatus(200);
});

app.post('/api/set-game-path', (req, res) => {
  userGamePath = req.body.path;
  res.sendStatus(200);
});


// === Start ===
app.listen(PORT, () => {
  backupModList();
  const result = linkOrWarn();
  if (result.status === 'linked') {
    console.log('[√] Symlink created from /mod-list/mod-list.json → user mod path');
  } else if (result.status === 'missing') {
    console.warn('[x] mod-list.json not found in selected path');
  }
  console.log(`Mod Manager running at http://localhost:${PORT}`);
});
