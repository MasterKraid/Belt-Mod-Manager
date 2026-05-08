const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function findInfoJson(zip) {
  return zip.getEntries().find((e) => e.entryName.endsWith('/info.json') || e.entryName === 'info.json');
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
        mtime: 0,
      });
    }
  }

  return parsed;
}

function scanModsMetadata(modsDir, gamePath) {
  const modZipCache = {}; // modName -> zipPath
  const results = [];

  if (!modsDir || !fs.existsSync(modsDir)) {
    return { results, modZipCache, modDirMtime: 0 };
  }

  let modDirMtime = 0;
  try {
    modDirMtime = fs.statSync(modsDir).mtimeMs;
  } catch {}

  if (gamePath) {
    results.push(...parseGameInfoMods(gamePath));
  }

  const files = fs.readdirSync(modsDir);
  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    const zipPath = path.join(modsDir, file);
    try {
      const stats = fs.statSync(zipPath);
      const zip = new AdmZip(zipPath);
      const infoEntry = findInfoJson(zip);
      if (!infoEntry) continue;

      const infoContent = zip.readAsText(infoEntry);
      const info = JSON.parse(infoContent);

      modZipCache[info.name] = zipPath;

      const hasThumbnail = zip
        .getEntries()
        .some(
          (e) =>
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
        thumbnail: hasThumbnail ? `/api/mods/thumbnail/${info.name}` : null,
        mtime: stats.mtimeMs,
      });
    } catch {
      // Ignore bad zips to keep scanning robust
    }
  }

  return { results, modZipCache, modDirMtime };
}

try {
  const { modsDir, gamePath } = workerData || {};
  const payload = scanModsMetadata(modsDir, gamePath);
  parentPort.postMessage({ ok: true, ...payload });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
}

