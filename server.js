const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const PROFILES_DIR = path.join(__dirname, 'profiles');
const MOD_LIST_PATH = path.join(__dirname, 'mod-list.json');

app.use(express.static('public'));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => res.render('index'));

app.get('/api/profiles', (req, res) => {
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  res.json(files.map(f => path.basename(f, '.json')));
});

app.get('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (fs.existsSync(file)) res.json(JSON.parse(fs.readFileSync(file)));
  else res.status(404).send('Profile not found');
});

app.post('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.put('/api/profiles/:name', (req, res) => {
  const file = path.join(PROFILES_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
  res.sendStatus(201);
});

app.post('/api/switch/:name', (req, res) => {
  const profileFile = path.join(PROFILES_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(profileFile)) return res.status(404).send('Profile not found');
  const mods = JSON.parse(fs.readFileSync(profileFile));
  fs.writeFileSync(MOD_LIST_PATH, JSON.stringify({ mods }, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Factorio Mod Manager running at http://localhost:${PORT}`));
