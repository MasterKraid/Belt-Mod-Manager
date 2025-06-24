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
let userModPath = MODS_DIR;

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
function findInfoJson(zip) {
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.entryName.endsWith('info.json')) {
      return entry;
    }
  }
  return null;
}

function scanMods(modPathOverride = null) {
  const modStatus = readModList();
  const mods = [];

  const baseDir = modPathOverride || MODS_DIR;
  const files = fs.readdirSync(baseDir);

  files.forEach(file => {
    const ext = path.extname(file);
    if (ext !== '.zip') return;

    const zipPath = path.join(baseDir, file);
    try {
      const zip = new AdmZip(zipPath);
      const infoEntry = findInfoJson(zip);

      if (infoEntry) {
        const infoContent = zip.readAsText(infoEntry);
        const info = JSON.parse(infoContent);
        mods.push({
          name: info.name,
          title: info.title || info.name,
          version: info.version,
          enabled: modStatus[info.name] ?? false
        });
      } else {
        console.warn(`No info.json in ${file}`);
      }
    } catch (e) {
      console.warn(`Error in zip ${file}:`, e);
    }
  });

  return mods;
}


// === API ROUTES ===

app.post('/api/set-mod-path', (req, res) => {
  const { path: newPath } = req.body;
  if (fs.existsSync(newPath)) {
    userModPath = newPath;
    res.sendStatus(200);
  } else {
    res.status(404).send('Invalid path');
  }
});

app.get('/api/mods', (req, res) => {
  const mods = scanMods(userModPath);
  res.json(mods);
});


app.listen(PORT, () => console.log(`Mod Manager running at http://localhost:${PORT}`));
