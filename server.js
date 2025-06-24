const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = 3000;

const MOD_LIST_PATH = path.join(__dirname, 'mod-list.json');
const MODS_DIR = path.join(process.env.APPDATA, 'Factorio', 'mods');
const PROFILES_DIR = path.join(__dirname, 'profiles');

app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve index
app.get('/', (req, res) => res.render('index'));

// Read mod-list.json
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
function scanMods() {
  const modStatus = readModList();
  const mods = [];

  const files = fs.readdirSync(MODS_DIR);
  files.forEach(file => {
    const ext = path.extname(file);
    if (ext !== '.zip') return;

    const zipPath = path.join(MODS_DIR, file);
    const zip = new AdmZip(zipPath);
    const infoEntry = zip.getEntry('info.json');

    if (infoEntry) {
      try {
        const infoContent = zip.readAsText(infoEntry);
        const info = JSON.parse(infoContent);
        mods.push({
          name: info.name,
          title: info.title || info.name,
          version: info.version,
          enabled: modStatus[info.name] ?? false
        });
      } catch (e) {
        console.warn(`Failed to read info.json from ${file}:`, e);
      }
    }
  });

  return mods;
}

// === API ROUTES ===

app.get('/api/mods', (req, res) => {
  const mods = scanMods();
  res.json(mods);
});

app.post('/api/mods', (req, res) => {
  const mods = req.body;
  const formatted = { mods: mods.map(m => ({ name: m.name, enabled: m.enabled })) };
  fs.writeFileSync(MOD_LIST_PATH, JSON.stringify(formatted, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Mod Manager running at http://localhost:${PORT}`));
