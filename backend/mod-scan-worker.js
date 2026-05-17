const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function parseLuaSettings(luaText) {
  const cleanText = luaText
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--.*/g, '');

  const blocks = [];
  let pos = 0;
  while (true) {
    const idx = cleanText.indexOf('{', pos);
    if (idx === -1) break;
    
    let depth = 1;
    let endIdx = -1;
    for (let i = idx + 1; i < cleanText.length; i++) {
      if (cleanText[i] === '{') depth++;
      else if (cleanText[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) break;
    
    const block = cleanText.slice(idx, endIdx + 1);
    if (/type\s*=\s*["'](?:bool|int|double|string|color)-setting["']/.test(block)) {
      blocks.push(block);
    }
    pos = idx + 1;
  }

  const leafBlocks = blocks.filter(b => {
    const matches = b.match(/type\s*=\s*["'](?:bool|int|double|string|color)-setting["']/g) || [];
    return matches.length === 1;
  });

  const settings = [];
  for (const block of leafBlocks) {
    const nameMatch = block.match(/name\s*=\s*["']([^"']+)["']/);
    const typeMatch = block.match(/type\s*=\s*["']([^"']+)["']/);
    const settingTypeMatch = block.match(/setting_type\s*=\s*["']([^"']+)["']/) || block.match(/setting-type\s*=\s*["']([^"']+)["']/);
    const defaultMatch = block.match(/default_value\s*=\s*([^,\n}]+)/);
    
    if (nameMatch && typeMatch) {
      const setting = {
        name: nameMatch[1],
        type: typeMatch[1],
        setting_type: settingTypeMatch ? settingTypeMatch[1] : 'startup'
      };

      if (defaultMatch) {
        const valStr = defaultMatch[1].trim();
        if (valStr === 'true') setting.default_value = true;
        else if (valStr === 'false') setting.default_value = false;
        else if (valStr.startsWith('"') || valStr.startsWith("'")) {
          setting.default_value = valStr.slice(1, -1);
        } else if (!isNaN(Number(valStr))) {
          setting.default_value = Number(valStr);
        } else {
          setting.default_value = valStr;
        }
      }

      const allowedMatch = block.match(/allowed_values\s*=\s*\{([^}]+)\}/);
      if (allowedMatch) {
        setting.allowed_values = allowedMatch[1]
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }

      const minMatch = block.match(/minimum_value\s*=\s*([^,\n}]+)/);
      if (minMatch) {
        const val = Number(minMatch[1].trim());
        setting.minimum_value = isNaN(val) ? minMatch[1].trim() : val;
      }
      const maxMatch = block.match(/maximum_value\s*=\s*([^,\n}]+)/);
      if (maxMatch) {
        const val = Number(maxMatch[1].trim());
        setting.maximum_value = isNaN(val) ? maxMatch[1].trim() : val;
      }

      settings.push(setting);
    }
  }
  return settings;
}

function parseCfg(cfgText) {
  const sections = {};
  let currentSection = null;
  const lines = cfgText.split(/\r?\n/);
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      sections[currentSection] = sections[currentSection] || {};
      continue;
    }
    
    if (currentSection) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        sections[currentSection][key] = value;
      }
    }
  }
  return sections;
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
          persistentCache[cacheKey].size === stats.size &&
          persistentCache[cacheKey].metadata.settings !== undefined) {
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
          settings: cached.settings,
          locale: cached.locale
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

      const hasThumbnail = entries.some(
        (e) =>
          e.entryName.toLowerCase().endsWith('/thumbnail.png') ||
          e.entryName.toLowerCase() === 'thumbnail.png'
      );

      // Parse settings
      const settings = [];
      const settingsEntries = entries.filter(e => {
        const lower = e.entryName.toLowerCase();
        return (lower.endsWith('settings.lua') || lower.endsWith('settings-updates.lua') || lower.endsWith('settings-final-fixes.lua')) && !e.isDirectory;
      });
      for (const entry of settingsEntries) {
        try {
          const parsed = parseLuaSettings(zip.readAsText(entry));
          settings.push(...parsed);
        } catch {}
      }

      // Parse locale (English only)
      const locale = { names: {}, descriptions: {}, values: {} };
      const localeEntries = entries.filter(e => {
        const lower = e.entryName.toLowerCase();
        return (lower.includes('/locale/en/') && (lower.endsWith('.cfg') || lower.endsWith('.ini'))) && !e.isDirectory;
      });
      for (const entry of localeEntries) {
        try {
          const cfg = parseCfg(zip.readAsText(entry));
          if (cfg['mod-setting-name']) {
            Object.assign(locale.names, cfg['mod-setting-name']);
          }
          if (cfg['mod-setting-description']) {
            Object.assign(locale.descriptions, cfg['mod-setting-description']);
          }
          if (cfg['string-setting-value']) {
            Object.assign(locale.values, cfg['string-setting-value']);
          }
        } catch {}
      }

      const metadata = {
        name: info.name,
        title: info.title || info.name,
        version: info.version || '0.0.0',
        author: info.author || info.contact || 'Unknown',
        description: info.description || '(no description)',
        dependencies: info.dependencies || [],
        homepage: info.homepage || '',
        hasThumbnail,
        settings,
        locale
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

  // Group to find latest versions
  const grouped = {};
  for (const m of results) {
    if (!grouped[m.name]) grouped[m.name] = [];
    grouped[m.name].push(m);
  }

  const finalResults = [];
  const finalModZipCache = {};

  for (const [name, list] of Object.entries(grouped)) {
    // Sort to find the latest
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

    // Mark the latest version and update the ZIP cache with it
    list.forEach((m, idx) => {
      m.latest = (idx === 0);
      if (m.latest && m._zipPath) {
        finalModZipCache[name] = m._zipPath;
      }
      finalResults.push(m);
    });
  }

  return { results: finalResults, modZipCache: finalModZipCache, modDirMtime };
}

try {
  const { modsDir, gamePath, cacheFilePath } = workerData || {};
  const payload = scanModsMetadata(modsDir, gamePath, cacheFilePath);
  parentPort.postMessage({ ok: true, ...payload });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
}

