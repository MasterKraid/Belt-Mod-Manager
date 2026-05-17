/**
 * Download Manager for Factorio mods.
 *
 * Download strategy:
 *   - If user has provided Factorio credentials: ALWAYS use official mods.factorio.com
 *   - If no credentials are stored: ALWAYS use re146.dev community mirror
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const credStore = require('./credential-store');

const FACTORIO_API = 'https://mods.factorio.com';
const RE146_STORAGE = 'https://mods-storage.re146.dev';
const ASSETS_BASE = 'https://assets-mod.factorio.com';

// Core/DLC mods that ship with the game — never download these
const CORE_MODS = new Set(['base', 'elevated-rails', 'quality', 'space-age']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'BeltModManager/0.9.3' },
      timeout: 15000,
      ...options
    }, resolve);
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function fetchJson(url) {
  const res = await httpsGet(url);
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return fetchJson(res.headers.location);
  }
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    res.on('error', reject);
  });
}

async function fetchHtml(url) {
  const res = await httpsGet(url);
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return fetchHtml(res.headers.location);
  }
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}


function headCheck(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'HEAD',
      headers: { 'User-Agent': 'BeltModManager/0.9.3' },
      timeout: 8000
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 ? parseInt(res.headers['content-length'] || '0', 10) : false);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Parse a single Factorio dependency string.
 *   "base >= 2.0.72"          -> { type:'required',  name:'base' }
 *   "(?) Aircraft >= 1.6.6"   -> { type:'optional',  name:'Aircraft' }
 *   "! Krastorio"             -> { type:'incompatible', name:'Krastorio' }
 *   "~ some-mod >= 1.0"       -> { type:'hidden',    name:'some-mod' }
 */
function parseDep(raw) {
  let s = raw.trim();
  let type = 'required';
  if (s.startsWith('(?)')) {
    type = 'optional';
    s = s.slice(3).trim();
  } else if (s.startsWith('?')) {
    type = 'optional';
    s = s.slice(1).trim();
  } else if (s.startsWith('(!)')) {
    type = 'incompatible';
    s = s.slice(3).trim();
  } else if (s.startsWith('!')) {
    type = 'incompatible';
    s = s.slice(1).trim();
  } else if (s.startsWith('~')) {
    type = 'hidden';
    s = s.slice(1).trim();
  }
  const name = s.split(/\s+/)[0];
  return { type, name };
}

// ---------------------------------------------------------------------------
// DownloadManager
// ---------------------------------------------------------------------------

class DownloadManager {
  constructor(getModsDir) {
    /** @type {function():string} returns current mods directory path */
    this.getModsDir = getModsDir;
    this.maxConcurrent = 3;
    /** @type {Map<number, object>} */
    this.jobs = new Map();
    this.activeCount = 0;
    this.queue = [];
    this._nextId = 1;
  }

  // ---- Portal API proxies ------------------------------------------------

  async searchMods(query, page, pageSize, sort, category, tag, factorioVersion, includeDeprecated, spaceAgeFilter) {
    const ps = pageSize || 20;
    const q = query ? query.trim() : '';

    // When a keyword is provided, use /search?query= (the real Factorio portal search endpoint)
    // The official JSON API does NOT support free-text search — q= is silently ignored by the API.
    if (q) {
      const searchParams = new URLSearchParams();
      searchParams.set('query', q);
      if (factorioVersion && factorioVersion !== 'any') {
        searchParams.set('factorio_version', factorioVersion);
      }
      if (category) {
        searchParams.set('category', category);
      }
      if (tag) {
        searchParams.set('tag', tag);
      }
      searchParams.set('show_deprecated', includeDeprecated ? 'True' : 'False');
      searchParams.set('exclude_category', 'internal');
      if (spaceAgeFilter === 'compatible') {
        searchParams.set('expansion', 'space-age');
      } else if (spaceAgeFilter === 'exclude') {
        searchParams.set('exclude_expansion', 'space-age');
      }
      if (page && page > 1) {
        searchParams.set('page', page);
      }

      const searchUrl = `${FACTORIO_API}/search?${searchParams.toString()}`;
      let html;
      try {
        html = await fetchHtml(searchUrl);
      } catch (err) {
        console.error('Search fetch error:', err.message);
        throw err;
      }

      // Parse search results — same structure as browse
      const scraped = [];
      const blocks = html.split('<div class="panel-inset-lighter flex-column p0">');
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const slugMatch = block.match(/href="\/mod\/([^"?\s]+)/);
        if (slugMatch) {
          const slug = slugMatch[1].trim();
          const thumbMatch = block.match(/class="[^"]*mod-thumbnail[^"]*"[\s\S]*?<img src="([^"]+)"/) || block.match(/<img[^>]*src="([^"]+)"/);
          let thumbnail = thumbMatch ? thumbMatch[1].trim() : '';
          if (thumbnail.startsWith('https://assets-mod.factorio.com')) {
            thumbnail = thumbnail.replace('https://assets-mod.factorio.com', '');
          }
          scraped.push({ slug, thumbnail });
        }
      }

      let pageCount = 1;
      const paginationMatch = html.match(/href="[^"]*page=(\d+)"/g) || [];
      paginationMatch.forEach(m => {
        const p = m.match(/page=(\d+)/);
        if (p) {
          const num = parseInt(p[1]);
          if (num > pageCount) pageCount = num;
        }
      });

      if (scraped.length === 0) {
        return { results: [], pagination: { count: 0, page: page || 1, page_count: 1, page_size: ps } };
      }

      const names = scraped.map(s => s.slug);
      const namelistUrl = `${FACTORIO_API}/api/mods?namelist=${encodeURIComponent(names.join(','))}`;
      let apiData;
      try {
        apiData = await fetchJson(namelistUrl);
      } catch (err) {
        console.error('Search batch metadata error:', err.message);
        throw err;
      }

      const scrapedMap = {};
      scraped.forEach((s, idx) => { scrapedMap[s.slug] = { index: idx, thumbnail: s.thumbnail }; });

      const results = (apiData.results || []).map(m => {
        const meta = scrapedMap[m.name] || { index: 999, thumbnail: '' };
        return { ...m, thumbnail: meta.thumbnail || m.thumbnail || '', _scrapedIndex: meta.index };
      });
      results.sort((a, b) => a._scrapedIndex - b._scrapedIndex);

      return this._normalizeResults({
        results,
        pagination: { count: results.length, page: page || 1, page_count: pageCount, page_size: ps }
      });
    }

    // No keyword: use JSON API for name/created_at sorts
    if (sort === 'name' || sort === 'created_at') {
      let url = `${FACTORIO_API}/api/mods?page=${page || 1}&page_size=${ps}` +
                `&sort=${sort}&sort_order=${sort === 'name' ? 'asc' : 'desc'}`;
      if (includeDeprecated) {
        url += '&hide_deprecated=false';
      } else {
        url += '&hide_deprecated=true';
      }
      const data = await fetchJson(url);
      return this._normalizeResults(data);
    }

    // Scrape-based browse for Most Downloaded, Trending, Highlighted, Recently Updated
    let pathName = '/browse';
    if (sort === 'downloads_count') {
      pathName = '/browse/downloaded';
    } else if (sort === 'trending_score') {
      pathName = '/browse/trending';
    } else if (sort === 'highlighted') {
      pathName = '/highlights';
    }

    const queryParams = new URLSearchParams();
    if (factorioVersion && factorioVersion !== 'any') {
      queryParams.set('factorio_version', factorioVersion);
    }
    if (category) {
      queryParams.set('category', category);
    }
    if (tag) {
      queryParams.set('tag', tag);
    }
    queryParams.set('show_deprecated', includeDeprecated ? 'True' : 'False');
    queryParams.set('exclude_category', 'internal');

    if (spaceAgeFilter === 'compatible') {
      queryParams.set('expansion', 'space-age');
    } else if (spaceAgeFilter === 'exclude') {
      queryParams.set('exclude_expansion', 'space-age');
    }

    if (page && pathName !== '/highlights') {
      queryParams.set('page', page);
    }

    const url = `${FACTORIO_API}${pathName}?${queryParams.toString()}`;

    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error('HTML Scraper fetch error:', err.message);
      throw err;
    }

    // Parse slugs and thumbnails
    const scraped = [];
    const isHighlights = (pathName === '/highlights');

    if (isHighlights) {
      const tiles = html.split('class="panel-inset-lighter mt0 flex-column flex-items-center mb12 mod-tile"');
      for (let i = 1; i < tiles.length; i++) {
        const tile = tiles[i];
        const slugMatch = tile.match(/href="\/mod\/([^"?\s]+)"/);
        if (slugMatch) {
          const slug = slugMatch[1].trim();
          const thumbMatch = tile.match(/<img src="([^"]+)"/);
          let thumbnail = thumbMatch ? thumbMatch[1].trim() : '';
          if (thumbnail.startsWith('https://assets-mod.factorio.com')) {
            thumbnail = thumbnail.replace('https://assets-mod.factorio.com', '');
          }
          scraped.push({ slug, thumbnail });
        }
      }
    } else {
      const blocks = html.split('<div class="panel-inset-lighter flex-column p0">');
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const slugMatch = block.match(/href="\/mod\/([^"?\s]+)/);
        if (slugMatch) {
          const slug = slugMatch[1].trim();
          const thumbMatch = block.match(/class="[^"]*mod-thumbnail[^"]*"[\s\S]*?<img src="([^"]+)"/) || block.match(/<img[^>]*src="([^"]+)"/);
          let thumbnail = thumbMatch ? thumbMatch[1].trim() : '';
          if (thumbnail.startsWith('https://assets-mod.factorio.com')) {
            thumbnail = thumbnail.replace('https://assets-mod.factorio.com', '');
          }
          scraped.push({ slug, thumbnail });
        }
      }
    }

    // Parse pagination page count
    let pageCount = 1;
    if (!isHighlights) {
      const paginationMatch = html.match(/href="[^"]*page=(\d+)"/g) || [];
      paginationMatch.forEach(m => {
        const p = m.match(/page=(\d+)/);
        if (p) {
          const num = parseInt(p[1]);
          if (num > pageCount) pageCount = num;
        }
      });
    }

    if (scraped.length === 0) {
      return {
        results: [],
        pagination: { count: 0, page: page || 1, page_count: 1, page_size: ps }
      };
    }

    // Fetch full metadata via official batch namelist API
    const names = scraped.map(s => s.slug);
    const namelistUrl = `${FACTORIO_API}/api/mods?namelist=${encodeURIComponent(names.join(','))}`;
    let apiData;
    try {
      apiData = await fetchJson(namelistUrl);
    } catch (err) {
      console.error('Batch metadata query error:', err.message);
      throw err;
    }

    const scrapedMap = {};
    scraped.forEach((s, idx) => {
      scrapedMap[s.slug] = { index: idx, thumbnail: s.thumbnail };
    });

    const results = (apiData.results || []).map(m => {
      const meta = scrapedMap[m.name] || { index: 999, thumbnail: '' };
      return { ...m, thumbnail: meta.thumbnail || m.thumbnail || '', _scrapedIndex: meta.index };
    });

    results.sort((a, b) => a._scrapedIndex - b._scrapedIndex);

    return this._normalizeResults({
      results,
      pagination: { count: results.length, page: page || 1, page_count: pageCount, page_size: ps }
    });
  }

  async getModDetails(modName) {
    const data = await fetchJson(`${FACTORIO_API}/api/mods/${encodeURIComponent(modName)}/full`);
    return data;
  }

  async getModInfo(modName) {
    return await fetchJson(`${FACTORIO_API}/api/mods/${encodeURIComponent(modName)}`);
  }

  async _normalizeResults(data) {
    const modsDir = this.getModsDir();
    const installedFiles = new Set();
    if (modsDir && fs.existsSync(modsDir)) {
      try {
        fs.readdirSync(modsDir).filter(f => f.endsWith('.zip')).forEach(f => installedFiles.add(f));
      } catch {}
    }

    if (data.results) {
      // Fetch thumbnails for mods missing them (API listing never includes them)
      // Batch-fetch in groups of 10 to avoid hammering
      const needThumb = data.results.filter(m => !m.thumbnail);
      for (let i = 0; i < needThumb.length; i += 10) {
        const batch = needThumb.slice(i, i + 10);
        await Promise.all(batch.map(async (m) => {
          try {
            const info = await fetchJson(`${FACTORIO_API}/api/mods/${encodeURIComponent(m.name)}`);
            if (info.thumbnail) m.thumbnail = info.thumbnail;
          } catch {}
        }));
      }

      data.results = data.results.map(m => {
        const lr = m.latest_release || (m.releases ? m.releases[m.releases.length - 1] : null);
        const installed = lr ? installedFiles.has(lr.file_name) : false;
        return {
          name: m.name,
          title: m.title || m.name,
          owner: m.owner || 'Unknown',
          summary: m.summary || '',
          downloads_count: m.downloads_count || 0,
          category: m.category || '',
          thumbnail: m.thumbnail ? `/api/portal/thumb?path=${encodeURIComponent(m.thumbnail)}` : null,
          latest_release: lr ? {
            version: lr.version,
            file_name: lr.file_name,
            download_url: lr.download_url,
            factorio_version: lr.info_json ? lr.info_json.factorio_version : ''
          } : null,
          installed
        };
      });
    }
    return data;
  }

  // ---- Dependency resolution ---------------------------------------------

  async resolveDependencies(modName, includeOptional = false, visited = new Set()) {
    if (visited.has(modName) || CORE_MODS.has(modName)) return [];
    visited.add(modName);

    try {
      const full = await this.getModDetails(modName);
      if (!full || !full.releases || full.releases.length === 0) return [];

      const lr = full.releases[full.releases.length - 1];
      const deps = (lr.info_json && lr.info_json.dependencies) || [];

      const result = [{
        modName: full.name,
        title: full.title || full.name,
        version: lr.version,
        fileName: lr.file_name,
        officialDownloadUrl: lr.download_url
      }];

      for (const raw of deps) {
        const dep = parseDep(raw);
        if (dep.type === 'incompatible' || dep.type === 'hidden') continue;
        if (dep.type === 'optional' && !includeOptional) continue;
        if (CORE_MODS.has(dep.name) || visited.has(dep.name)) continue;

        const sub = await this.resolveDependencies(dep.name, includeOptional, visited);
        result.push(...sub);
      }
      return result;
    } catch (err) {
      console.warn(`[DownloadManager] Failed to resolve deps for ${modName}:`, err.message);
      return [];
    }
  }

  // ---- Download jobs -----------------------------------------------------

  queueDownload(modName, version, fileName, officialDownloadUrl, keepOldVersion = false) {
    // Deduplicate
    for (const [, job] of this.jobs) {
      if (job.fileName === fileName && ['downloading', 'queued', 'complete'].includes(job.status)) {
        return this._jobStatus(job);
      }
    }

    // Already on disk?
    if (this._isInstalled(fileName)) {
      const job = this._makeJob(modName, version, fileName, officialDownloadUrl, keepOldVersion);
      job.status = 'complete';
      job.progress = 1;
      job.skipped = true;
      this.jobs.set(job.id, job);
      return this._jobStatus(job);
    }

    const job = this._makeJob(modName, version, fileName, officialDownloadUrl, keepOldVersion);
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this._processQueue();
    return this._jobStatus(job);
  }

  async queueWithDependencies(modName, includeOptional = false, keepOldVersion = false) {
    const deps = await this.resolveDependencies(modName, includeOptional);
    const plan = { downloads: [], skipped: [] };

    for (const dep of deps) {
      if (this._isInstalled(dep.fileName)) {
        plan.skipped.push({ modName: dep.modName, title: dep.title, version: dep.version, fileName: dep.fileName });
      } else {
        const job = this.queueDownload(dep.modName, dep.version, dep.fileName, dep.officialDownloadUrl, keepOldVersion);
        plan.downloads.push(this._jobStatus(job));
      }
    }
    return plan;
  }

  cancelDownload(id) {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'queued') {
      job.status = 'cancelled';
      this.queue = this.queue.filter(qId => qId !== id);
      return true;
    }
    if (job.status === 'downloading') {
      job.status = 'cancelled';
      if (job._req) { try { job._req.destroy(); } catch {} }
      this._cleanPartFile(job);
      this.activeCount--;
      this._processQueue();
      return true;
    }
    return false;
  }

  getStatus() {
    return Array.from(this.jobs.values()).map(j => this._jobStatus(j));
  }

  clearCompleted() {
    for (const [id, job] of this.jobs) {
      if (['complete', 'failed', 'cancelled'].includes(job.status)) {
        this.jobs.delete(id);
      }
    }
  }

  // ---- Internals ---------------------------------------------------------

  _makeJob(modName, version, fileName, officialDownloadUrl, keepOldVersion = false) {
    return {
      id: this._nextId++,
      modName, version, fileName, officialDownloadUrl, keepOldVersion,
      status: 'queued', progress: 0,
      totalBytes: 0, downloadedBytes: 0, speed: 0,
      error: null, retryCount: 0, skipped: false,
      _req: null
    };
  }

  _validateZipFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid download file name');
    }
    if (path.basename(fileName) !== fileName) {
      throw new Error('Invalid download file name');
    }
    if (!fileName.toLowerCase().endsWith('.zip')) {
      throw new Error('Invalid download file type');
    }
    // Disallow path traversal-ish sequences even as basename.
    if (fileName.includes('..')) {
      throw new Error('Invalid download file name');
    }
  }

  _jobStatus(job) {
    return {
      id: job.id, modName: job.modName, version: job.version,
      fileName: job.fileName, status: job.status, progress: job.progress,
      totalBytes: job.totalBytes, downloadedBytes: job.downloadedBytes,
      speed: job.speed, error: job.error, retryCount: job.retryCount,
      skipped: job.skipped || false
    };
  }

  _isInstalled(fileName) {
    const dir = this.getModsDir();
    if (!dir) return false;
    return fs.existsSync(path.join(dir, fileName));
  }

  _cleanPartFile(job) {
    try {
      const p = path.join(this.getModsDir(), job.fileName + '.part');
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }

  _getCredentials() {
    return credStore.loadCredentials();
  }

  _processQueue() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job || job.status !== 'queued') continue;
      this.activeCount++;
      this._executeDownload(job);
    }
  }

  async _executeDownload(job, attempt = 1) {
    const MAX_RETRIES = 3;
    const modsDir = this.getModsDir();
    if (!modsDir || !fs.existsSync(modsDir)) {
      job.status = 'failed'; job.error = 'Mods directory not found';
      this.activeCount--; this._processQueue(); return;
    }

    job.status = 'downloading';
    job.retryCount = attempt - 1;

    try {
      this._validateZipFileName(job.fileName);
    } catch (e) {
      job.status = 'failed';
      job.error = e.message;
      this.activeCount--;
      this._processQueue();
      return;
    }

    const partPath = path.join(modsDir, job.fileName + '.part');
    const finalPath = path.join(modsDir, job.fileName);

    try {
      // Strategy: if user has auth creds → official API, otherwise → re146 mirror
      const creds = this._getCredentials();
      let downloadUrl;

      if (creds && job.officialDownloadUrl) {
        // Authenticated: always use official Factorio download
        downloadUrl = `${FACTORIO_API}${job.officialDownloadUrl}?username=${encodeURIComponent(creds.username)}&token=${encodeURIComponent(creds.token)}`;
      } else {
        // No credentials: use re146.dev mirror
        const re146Url = `${RE146_STORAGE}/${encodeURIComponent(job.modName)}/${encodeURIComponent(job.version)}.zip`;
        const re146Ok = await headCheck(re146Url);
        if (re146Ok !== false) {
          downloadUrl = re146Url;
        } else {
          throw new Error(
            'Mod not available on re146.dev mirror. Add Factorio credentials via the profile button to download from the official source.'
          );
        }
      }

      await this._streamDownload(job, downloadUrl, partPath);

      // Rename .part to final
      if (fs.existsSync(partPath)) {
        fs.renameSync(partPath, finalPath);
      }

      // Automatically delete older versions of the same mod if keepOldVersion is false
      if (!job.keepOldVersion) {
        try {
          const prefix = job.modName + '_';
          const files = fs.readdirSync(modsDir);
          for (const file of files) {
            if (file.endsWith('.zip') && file !== job.fileName && file.startsWith(prefix)) {
              try {
                fs.unlinkSync(path.join(modsDir, file));
              } catch (e) {}
            }
          }
        } catch (err) {}
      }

      job.status = 'complete';
      job.progress = 1;
      this.activeCount--;

      if (typeof this.onJobComplete === 'function') {
        try {
          this.onJobComplete(job);
        } catch (err) {
          console.error('[DownloadManager] Error in onJobComplete callback:', err);
        }
      }

      this._processQueue();

    } catch (err) {
      this._cleanPartFile(job);

      if (job.status === 'cancelled') {
        this.activeCount--;
        this._processQueue();
        return;
      }

      if (attempt < MAX_RETRIES) {
        job.status = 'retrying';
        job.error = err.message;
        setTimeout(() => this._executeDownload(job, attempt + 1), 2000 * attempt);
      } else {
        job.status = 'failed';
        job.error = err.message;
        this.activeCount--;
        this._processQueue();
      }
    }
  }

  _streamDownload(job, url, destPath) {
    return new Promise((resolve, reject) => {
      const allowedHosts = new Set(['mods.factorio.com', 'mods-storage.re146.dev']);
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }
        let parsed;
        try {
          parsed = new URL(requestUrl);
        } catch {
          reject(new Error('Invalid download URL'));
          return;
        }
        if (parsed.protocol !== 'https:') {
          reject(new Error('Insecure download URL'));
          return;
        }
        if (!allowedHosts.has(parsed.hostname)) {
          reject(new Error('Unexpected download host'));
          return;
        }

        const req = https.get(requestUrl, {
          headers: { 'User-Agent': 'BeltModManager/0.9.3' },
          timeout: 30000
        }, (res) => {
          // Follow redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doRequest(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          job.totalBytes = totalBytes;
          job.downloadedBytes = 0;

          const file = fs.createWriteStream(destPath);
          let lastTime = Date.now();
          let lastBytes = 0;

          res.on('data', (chunk) => {
            if (job.status === 'cancelled') {
              res.destroy();
              file.close();
              return;
            }
            job.downloadedBytes += chunk.length;
            job.progress = totalBytes > 0 ? job.downloadedBytes / totalBytes : 0;

            // Compute speed every 250ms
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            if (elapsed >= 0.25) {
              job.speed = (job.downloadedBytes - lastBytes) / elapsed;
              lastBytes = job.downloadedBytes;
              lastTime = now;
            }
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              if (job.status === 'cancelled') return reject(new Error('Cancelled'));
              resolve();
            });
          });

          res.on('error', (err) => { file.close(); reject(err); });
          file.on('error', (err) => { res.destroy(); reject(err); });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
        job._req = req;
      };

      doRequest(url);
    });
  }
}

module.exports = { DownloadManager, ASSETS_BASE, CORE_MODS, fetchJson };
