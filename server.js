const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const fse = require('fs-extra');


const app = express();
const PORT = 3000;
const DEFAULT_MOD_PATH = path.join(process.env.APPDATA, 'Factorio', 'mods');
const PROFILES_DIR = path.join(__dirname, 'profiles');
const MOD_LIST_PATH = path.join(__dirname, 'mod-list.json');

let userModPath = DEFAULT_MOD_PATH;

app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.get('/', (req, res) => res.render('index'));

function readModList() {
  try {
    const raw = fs.readFileSync(MOD_LIST_PATH);
    const parsed = JSON.parse(raw);
    const dict = {};
    parsed.mods.forEach(mod => {
      dict[mod.name] = mod.enabled;
    });
    return dict;
  } catch {
    return {};
  }
}

// Scan zip files and return mod list
function findInfoJson(zip) {
  const entries = zip.getEntries();
  return entries.find(entry => entry.entryName.endsWith('info.json'));
}

function scanMods(modPathOverride = null) {
  const modStatus = readModList();
  const mods = [];
  const baseDir = modPathOverride || userModPath;
  const files = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];

  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    try {
      const zip = new AdmZip(path.join(baseDir, file));
      const infoEntry = findInfoJson(zip);
      if (!infoEntry) continue;
      const info = JSON.parse(zip.readAsText(infoEntry));
      mods.push({
        name: info.name,
        title: info.title || info.name,
        version: info.version,
        enabled: modStatus[info.name] ?? false
      });
    } catch {}
  }
  return mods;
}

app.get('/api/get-mod-path', (req, res) => {
  res.json({ path: userModPath });
});

app.post('/api/set-mod-path', (req, res) => {
  const newPath = req.body.path;
  if (fs.existsSync(newPath)) {
    userModPath = newPath;
    res.sendStatus(200);
  } else {
    res.status(404).send('Invalid path');
  }
});

app.get('/api/mods', (req, res) => {
  res.json(scanMods());
});

app.post('/api/mods', (req, res) => {
  const mods = req.body;
  const formatted = { mods: mods.map(m => ({ name: m.name, enabled: m.enabled })) };
  fs.writeFileSync(MOD_LIST_PATH, JSON.stringify(formatted, null, 2));
  res.sendStatus(200);
});

app.get('/api/profiles', (req, res) => {
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  res.json(files.map(f => f.replace('.json', '')));
});

app.get('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(file)) return res.json(scanMods());
  res.json(JSON.parse(fs.readFileSync(file)));
});

app.post('/api/profiles/:name', (req, res) => {
  fs.writeFileSync(path.join(PROFILES_DIR, `${req.params.name}.json`), JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.put('/api/profiles/:name', (req, res) => {
  fs.writeFileSync(path.join(PROFILES_DIR, `${req.params.name}.json`), JSON.stringify(req.body, null, 2));
  res.sendStatus(201);
});

app.post('/api/switch/:name', (req, res) => {
  const profilePath = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(profilePath)) return res.status(404).send('Profile not found');
  const mods = JSON.parse(fs.readFileSync(profilePath));
  fs.writeFileSync(MOD_LIST_PATH, JSON.stringify({ mods: mods.map(m => ({ name: m.name, enabled: m.enabled })) }, null, 2));
  res.sendStatus(200);
});

app.post('/api/rename-profile', (req, res) => {
  const { oldName, newName } = req.body;
  const oldPath = path.join(PROFILES_DIR, `${oldName}.json`);
  const newPath = path.join(PROFILES_DIR, `${newName}.json`);
  if (!fs.existsSync(oldPath)) return res.status(404).send('Old profile not found');
  if (fs.existsSync(newPath)) return res.status(409).send('New profile name already exists');
  fs.renameSync(oldPath, newPath);
  res.sendStatus(200);
});


app.listen(PORT, () => console.log(`🛠 Running on http://localhost:${PORT}`));
