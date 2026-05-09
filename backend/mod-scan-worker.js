const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

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

function scanModsMetadata(modsDir, gamePath, cacheFilePath) {
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

  // Load persistent metadata cache
  let persistentCache = {};
  if (cacheFilePath) {
    try {
      if (fs.existsSync(cacheFilePath)) {
        persistentCache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      }
    } catch {}
  }

  let cacheUpdated = false;

  const files = fs.readdirSync(modsDir);
  for (const file of files) {
    if (!file.endsWith('.zip')) continue;
    const zipPath = path.join(modsDir, file);
    try {
      const stats = fs.statSync(zipPath);
      const cacheKey = file;

      if (persistentCache[cacheKey] && 
          persistentCache[cacheKey].mtime === stats.mtimeMs && 
          persistentCache[cacheKey].size === stats.size) {
        const cached = persistentCache[cacheKey].metadata;
        modZipCache[cached.name] = zipPath;
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
        });
        continue;
      }

      // Cache miss: parse the ZIP file
      const zip = new AdmZip(zipPath);
      
      const entries = zip.getEntries();
      const infoEntry = entries.find((e) => e.entryName.endsWith('/info.json') || e.entryName === 'info.json');
      if (!infoEntry) continue;

      const infoContent = zip.readAsText(infoEntry);
      const info = JSON.parse(infoContent);

      modZipCache[info.name] = zipPath;

      const hasThumbnail = entries.some(
        (e) =>
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
      });
    } catch {
      // Ignore bad zips to keep scanning robust
    }
  }

  // Save updated cache
  if (cacheFilePath && cacheUpdated) {
    try {
      fs.writeFileSync(cacheFilePath, JSON.stringify(persistentCache, null, 2), 'utf-8');
    } catch {}
  }

  return { results, modZipCache, modDirMtime };
}

try {
  const { modsDir, gamePath, cacheFilePath } = workerData || {};
  const payload = scanModsMetadata(modsDir, gamePath, cacheFilePath);
  parentPort.postMessage({ ok: true, ...payload });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
}

