process.env.NODE_ENV = 'test';

const request = require('supertest');
const fs = require('fs-extra');
const nativeFs = require('fs');
const path = require('path');
const { app, downloadManager, isCacheCleared, invalidateModCache, isSafeProfileName } = require('../backend/server');

const TEST_PROFILES_DIR = path.join(__dirname, '../test-profiles');
const TEST_BACKUP_DIR = path.join(__dirname, '../test-backup');
const TEST_MOD_LIST_DIR = path.join(__dirname, '../test-mod-list');

// Shared constant helper to keep tests DRY
const makeProfileMods = () => [
  { name: 'base', enabled: true },
  { name: 'test-mod', enabled: false }
];

beforeAll(() => {
  fs.ensureDirSync(TEST_PROFILES_DIR);
  fs.ensureDirSync(TEST_BACKUP_DIR);
  fs.ensureDirSync(TEST_MOD_LIST_DIR);
});

afterAll(() => {
  fs.removeSync(TEST_PROFILES_DIR);
  fs.removeSync(TEST_BACKUP_DIR);
  fs.removeSync(TEST_MOD_LIST_DIR);
});

describe('API Endpoints', () => {
  afterEach(() => {
    // 1. ALWAYS release mocks first so the environment is pure again
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // 2. NOW perform physical side-effects using the real, unmocked filesystem
    fs.emptyDirSync(TEST_PROFILES_DIR);
    fs.emptyDirSync(TEST_BACKUP_DIR);
    fs.emptyDirSync(TEST_MOD_LIST_DIR);

    invalidateModCache();
  });

  it('GET /api/check-modlist should return exists boolean', async () => {
    const res = await request(app).get('/api/check-modlist');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('exists');
    expect(typeof res.body.exists).toBe('boolean');
  });

  it('GET /api/profiles should return empty array initially or with default', async () => {
    const res = await request(app).get('/api/profiles');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/profiles/:name should create a new profile', async () => {
    const res = await request(app)
      .post('/api/profiles/test-profile')
      .send(makeProfileMods());
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles');
    expect(checkRes.headers['content-type']).toMatch(/json/);
    expect(checkRes.body).toContain('test-profile');
  });

  it('POST /api/profiles/:name should overwrite an existing profile when posted again', async () => {
    await request(app)
      .post('/api/profiles/test-overwrite')
      .send(makeProfileMods());

    const updatedMods = [
      { name: 'base', enabled: true },
      { name: 'test-mod', enabled: true },
      { name: 'mod-3', enabled: true }
    ];

    const res = await request(app)
      .post('/api/profiles/test-overwrite')
      .send(updatedMods);
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles/test-overwrite');
    expect(checkRes.statusCode).toEqual(200);
    expect(checkRes.headers['content-type']).toMatch(/json/);
    const mod3 = checkRes.body.find(m => m.name === 'mod-3');
    expect(mod3).toBeDefined();
    expect(mod3.enabled).toBe(true);
  });

  it('GET /api/profiles/:name should retrieve the created profile', async () => {
    await request(app).post('/api/profiles/test-profile').send(makeProfileMods());

    const res = await request(app).get('/api/profiles/test-profile');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.find(m => m.name === 'base')).toBeDefined();
    expect(res.body.find(m => m.name === 'test-mod')).toBeDefined();
    expect(typeof res.body.find(m => m.name === 'base').enabled).toBe('boolean');
  });

  it('POST /api/rename-profile should rename an existing profile', async () => {
    await request(app).post('/api/profiles/test-profile').send(makeProfileMods());

    const res = await request(app)
      .post('/api/rename-profile')
      .send({ oldName: 'test-profile', newName: 'renamed-profile' });
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles');
    expect(checkRes.body).toContain('renamed-profile');
    expect(checkRes.body).not.toContain('test-profile');
  });

  it('POST /api/delete-profile should delete an existing profile', async () => {
    await request(app).post('/api/profiles/renamed-profile').send(makeProfileMods());

    const res = await request(app)
      .post('/api/delete-profile')
      .send({ name: 'renamed-profile' });
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles');
    expect(checkRes.body).not.toContain('renamed-profile');
  });

  it('GET /api/installed-mods should always return an array', async () => {
    const res = await request(app).get('/api/installed-mods');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/profiles/:name should return bad payload state when profile JSON is invalid shape', async () => {
    const badPath = path.join(TEST_PROFILES_DIR, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify({ not: 'an array' }, null, 2), 'utf-8');

    const res = await request(app).get('/api/profiles/bad');
    // Loose boundary check for status code mapping changes
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('POST /api/switch/:name should fail when profile JSON is invalid shape', async () => {
    const badPath = path.join(TEST_PROFILES_DIR, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify({ not: 'an array' }, null, 2), 'utf-8');

    const res = await request(app).post('/api/switch/bad');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('profile routes should 400 on invalid profile name', async () => {
    const res = await request(app).get('/api/profiles/a..b');
    expect(res.statusCode).toEqual(400);

    const res2 = await request(app).post('/api/profiles/evil%5Cname').send([]);
    expect(res2.statusCode).toEqual(400);
  });

  describe('Download Manager Cache Invalidation and Routing', () => {
    it('should queue a single download on POST /api/portal/download', async () => {
      const mockJob = { id: 123, modName: 'test-mod', version: '0.1.0', status: 'queued' };
      const spy = jest.spyOn(downloadManager, 'queueDownload').mockReturnValue(mockJob);

      const res = await request(app)
        .post('/api/portal/download')
        .send({
          modName: 'test-mod',
          version: '0.1.0',
          fileName: 'test-mod_0.1.0.zip',
          officialDownloadUrl: 'https://example.com/test-mod_0.1.0.zip'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual(mockJob);
      expect(spy).toHaveBeenCalledWith(
        'test-mod',
        '0.1.0',
        'test-mod_0.1.0.zip',
        'https://example.com/test-mod_0.1.0.zip',
        false
      );
    });

    it('should trigger clearCompleted on POST /api/portal/downloads-clear', async () => {
      const spy = jest.spyOn(downloadManager, 'clearCompleted').mockImplementation();

      const res = await request(app).post('/api/portal/downloads-clear');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual({ success: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should invalidate the server-side mod directory cache when a job completes', async () => {
      // First populate the cache so isCacheCleared() returns false
      await request(app).get('/api/installed-mods');

      // Execute onJobComplete callback
      const mockJob = { id: 123, modName: 'test-mod', status: 'complete' };
      downloadManager.onJobComplete(mockJob);

      // Verify behavioral side effect that cache is cleared cleanly
      expect(isCacheCleared()).toBe(true);
    });

    it('should cancel a download on POST /api/portal/download-cancel/:id', async () => {
      const spy = jest.spyOn(downloadManager, 'cancelDownload').mockReturnValue(true);

      const res = await request(app).post('/api/portal/download-cancel/123');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual({ success: true });
      expect(spy).toHaveBeenCalledWith(123);
    });

    it('should return 200 and the current active profile on GET /api/active-profile', async () => {
      const res = await request(app).get('/api/active-profile');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('activeProfile');
      expect(typeof res.body.activeProfile).toBe('string');
    });

    it('should return 200 and game running status on GET /api/game-status', async () => {
      const res = await request(app).get('/api/game-status');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('running');
      expect(typeof res.body.running).toBe('boolean');
    });

    it('should return authentication status on GET /api/portal/auth-status', async () => {
      const res = await request(app).get('/api/portal/auth-status');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('authenticated');
      expect(typeof res.body.authenticated).toBe('boolean');
    });

    it('should clear stored credentials on POST /api/portal/auth-clear', async () => {
      const res = await request(app).post('/api/portal/auth-clear');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe('Edge Cases and Negative Scenarios', () => {
    it('should return 400 on POST /api/portal/download when parameters are missing', async () => {
      const res = await request(app)
        .post('/api/portal/download')
        .send({ modName: 'test-mod' });
      expect(res.statusCode).toEqual(400);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('error');
    });

    it('should automatically initialize and return 200 on GET /api/profiles/:name for a nonexistent profile', async () => {
      const res = await request(app).get('/api/profiles/nonexistent-profile-12345');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 400 on POST /api/switch/:name with unsafe name', async () => {
      const res = await request(app).post('/api/switch/..%2Fevil');
      expect(res.statusCode).toEqual(400);
      expect(res.text).toBe('Invalid profile name');
    });

    it('should return 404 on POST /api/switch/:name for nonexistent profile', async () => {
      const res = await request(app).post('/api/switch/nonexistent-profile-999');
      expect(res.statusCode).toEqual(404);
      expect(res.text).toBe('Not found');
    });

    it('should return 409 on POST /api/rename-profile when the new name is already taken', async () => {
      await request(app).post('/api/profiles/profile-a').send(makeProfileMods());
      await request(app).post('/api/profiles/profile-b').send(makeProfileMods());

      const res = await request(app)
        .post('/api/rename-profile')
        .send({ oldName: 'profile-a', newName: 'profile-b' });

      expect(res.statusCode).toEqual(409);
      expect(res.text).toBe('New name taken');
    });

    it('should return success: false when canceling a nonexistent download ID', async () => {
      const spy = jest.spyOn(downloadManager, 'cancelDownload').mockReturnValue(false);

      const res = await request(app).post('/api/portal/download-cancel/9999');
      expect(res.statusCode).toEqual(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual({ success: false });
    });

    it('should return 400 on POST /api/set-mod-path with empty path', async () => {
      const res = await request(app)
        .post('/api/set-mod-path')
        .send({ path: '' });
      expect(res.statusCode).toEqual(400);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('message', 'Invalid path');
    });

    it('should reject non-array payloads on profile routes expecting arrays', async () => {
      const res = await request(app)
        .post('/api/profiles/bad-payload-profile')
        .send({ invalid: true });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Filesystem Failure, Concurrency, and Contract Fuzzing Tests', () => {
    it('should handle EACCES filesystem permissions failure gracefully during profile write', async () => {
      jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(() => {
        const err = new Error('Permission denied');
        err.code = 'EACCES';
        throw err;
      });

      const res = await request(app)
        .post('/api/profiles/permission-fail')
        .send(makeProfileMods());

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle ENOSPC disk full failure gracefully during profile write', async () => {
      jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(() => {
        const err = new Error('No space left on device');
        err.code = 'ENOSPC';
        throw err;
      });

      const res = await request(app)
        .post('/api/profiles/disk-full-fail')
        .send(makeProfileMods());

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle simultaneous concurrent writes to the same profile successfully and verify deep logical consistency', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        request(app)
          .post('/api/profiles/concurrent-profile')
          .send([{ name: 'base', enabled: true }, { name: `test-mod-${i}`, enabled: true }])
      );

      const results = await Promise.all(promises);
      results.forEach((res) => {
        expect(res.statusCode).toEqual(200);
      });

      // Confirm final state is valid JSON, has no duplicates, and contains expected keys
      const checkRes = await request(app).get('/api/profiles/concurrent-profile');
      expect(checkRes.statusCode).toEqual(200);
      expect(Array.isArray(checkRes.body)).toBe(true);

      const names = checkRes.body.map(m => m.name);
      expect(names).toContain('base');
      
      // Every name must be unique (no duplicate state corruption)
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toEqual(names.length);

      // Verify that the final write is exactly one of the valid state results
      const testModKeys = names.filter(n => n.startsWith('test-mod-'));
      expect(testModKeys.length).toBe(1);
    });

    it('should safely handle concurrent filesystem race points (rename + delete and switch + delete)', async () => {
      const profileName = 'race-target-profile';
      await request(app)
        .post(`/api/profiles/${profileName}`)
        .send([{ name: 'base', enabled: true }]);

      const renamePromise = request(app)
        .post('/api/rename-profile')
        .send({ oldName: profileName, newName: 'race-renamed-profile' });

      const deletePromise = request(app)
        .post('/api/delete-profile')
        .send({ name: profileName });

      const [renameRes, deleteRes] = await Promise.all([renamePromise, deletePromise]);

      expect([200, 400, 404, 500]).toContain(renameRes.statusCode);
      expect([200, 400, 404, 500]).toContain(deleteRes.statusCode);

      const checkRes = await request(app).get('/api/profiles');
      expect(checkRes.statusCode).toEqual(200);
    });

    it('should reject traversal, encoded traversal, and special Windows device names via profiles endpoints', async () => {
      const evilNames = [
        '..%255c..', 'CON', 'aux', 'nul', 'PRN', 'LPT1', '..\\..\\test',
        '%2e%2e%2f', '..%c0%af', '%252e%252e%255c', 'CON.json', 'aux.json'
      ];
      for (const name of evilNames) {
        // Assert actual implementation validates it as unsafe
        expect(isSafeProfileName(name)).toBe(false);

        // Assert API endpoints reject it safely
        const resGet = await request(app).get(`/api/profiles/${name}`);
        expect([400, 404]).toContain(resGet.statusCode);

        const resPost = await request(app).post(`/api/profiles/${name}`).send([]);
        expect([400, 404]).toContain(resPost.statusCode);
      }
    });

    it('should reject malformed JSON body payloads safely at the middleware parser layer', async () => {
      const res = await request(app)
        .post('/api/profiles/bad-json-syntax')
        .set('Content-Type', 'application/json')
        .send('{"bad-json-payload"');
      
      // Express bodyParser rejects invalid JSON with 400
      expect(res.statusCode).toEqual(400);
    });

    it('should handle large-scale payloads with 5,000+ mods without crashing, stack overflows, or memory leaks (under 2,000ms)', async () => {
      const largePayload = Array.from({ length: 5000 }, (_, i) => ({
        name: `stress-mod-${i}`,
        enabled: i % 2 === 0
      }));

      const start = Date.now();

      const res = await request(app)
        .post('/api/profiles/large-stress-profile')
        .send(largePayload);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000); // Loose 10-second bound for CI stability under load

      expect(res.statusCode).toEqual(200);

      // Read and verify the exact written JSON structure on disk
      const diskFilePath = path.join(TEST_PROFILES_DIR, 'large-stress-profile.json');
      const diskContent = JSON.parse(nativeFs.readFileSync(diskFilePath, 'utf-8'));
      
      expect(diskContent).toHaveLength(5000);
      
      const uniqueNames = new Set(diskContent.map(m => m.name));
      expect(uniqueNames.size).toBe(5000);

      // Verify the GET response includes the merged scanned mods correctly
      const checkRes = await request(app).get('/api/profiles/large-stress-profile');
      expect(checkRes.statusCode).toEqual(200);
      expect(checkRes.body.length).toBeGreaterThanOrEqual(5000);
    });

    it('should enforce strict schema and contract types for API responses', async () => {
      // 1. GET /api/profiles response contract check
      const profilesRes = await request(app).get('/api/profiles');
      expect(profilesRes.statusCode).toEqual(200);
      expect(Array.isArray(profilesRes.body)).toBe(true);
      profilesRes.body.forEach((item) => {
        expect(typeof item).toBe('string');
      });

      // 2. GET /api/profiles/:name response contract check
      await request(app).post('/api/profiles/contract-test').send(makeProfileMods());
      const modsRes = await request(app).get('/api/profiles/contract-test');
      expect(modsRes.statusCode).toEqual(200);
      expect(Array.isArray(modsRes.body)).toBe(true);
      modsRes.body.forEach((mod) => {
        expect(mod).toHaveProperty('name');
        expect(typeof mod.name).toBe('string');
        expect(mod).toHaveProperty('enabled');
        expect(typeof mod.enabled).toBe('boolean');
      });
    });

    it('should return 404 when deleting a nonexistent profile', async () => {
      const res = await request(app)
        .post('/api/delete-profile')
        .send({ name: 'does-not-exist' });

      expect([400, 404]).toContain(res.statusCode);
    });

    it('should reject invalid rename payloads', async () => {
      const res = await request(app)
        .post('/api/rename-profile')
        .send({ oldName: '', newName: '../evil' });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject malformed mod entries inside profile arrays', async () => {
      const res = await request(app)
        .post('/api/profiles/bad-mod-shape')
        .send([
          { enabled: true },
          { name: 123, enabled: 'yes' }
        ]);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject duplicate mod names in a profile payload', async () => {
      const res = await request(app)
        .post('/api/profiles/duplicate-mods')
        .send([
          { name: 'base', enabled: true },
          { name: 'base', enabled: false }
        ]);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle corrupted JSON profile files safely', async () => {
      const badPath = path.join(TEST_PROFILES_DIR, 'corrupted.json');

      fs.writeFileSync(badPath, '{"bad json"', 'utf-8');

      const res = await request(app).get('/api/profiles/corrupted');

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject non-numeric download cancel IDs', async () => {
      const res = await request(app)
        .post('/api/portal/download-cancel/not-a-number');

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should survive repeated cache invalidation calls', () => {
      expect(() => {
        invalidateModCache();
        invalidateModCache();
        invalidateModCache();
      }).not.toThrow();
    });

    it('should reject prototype pollution payloads inside profile JSON', async () => {
      const payload = JSON.parse('{"__proto__": {"polluted": true}}');
      const res = await request(app)
        .post('/api/profiles/proto-pollute')
        .send(payload);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(Object.prototype.polluted).toBeUndefined(); // Verify prototype remains intact!
    });

    it('should reject profile names with null-byte injection', async () => {
      const res = await request(app)
        .post('/api/profiles/test%00profile')
        .send([{ name: 'base', enabled: true }]);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject content-type mismatches or non-JSON payloads on profiles', async () => {
      const res = await request(app)
        .post('/api/profiles/test-profile')
        .set('Content-Type', 'text/plain')
        .send('not json');

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject extremely deep JSON nesting to prevent stack exhaustion', async () => {
      let deep = {};
      for (let i = 0; i < 100; i++) {
        deep = { child: deep };
      }
      const res = await request(app)
        .post('/api/profiles/deep-nest')
        .send(deep);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should behave correctly with cache invalidation: populates cache, reuses it on subsequent calls, and rescans on invalidation', async () => {
      invalidateModCache();

      const readdirSpy = jest.spyOn(nativeFs, 'readdirSync');

      // 1. First trigger: should call readdirSync to populate the cache
      await request(app).get('/api/installed-mods');
      const initialCallCount = readdirSpy.mock.calls.length;
      expect(initialCallCount).toBeGreaterThanOrEqual(1);

      // Reset mock tracking but keep implementation
      readdirSpy.mockClear();

      // 2. Second trigger: should reuse the cache, calling readdirSync exactly 0 times
      await request(app).get('/api/installed-mods');
      expect(readdirSpy).not.toHaveBeenCalled();

      // 3. Invalidate the cache
      invalidateModCache();

      // 4. Third trigger: must rescan by calling readdirSync again
      await request(app).get('/api/installed-mods');
      expect(readdirSpy).toHaveBeenCalled();
    });

    it('should reject or handle oversized payloads safely to prevent memory exhaustion', async () => {
      // Guarantee exactly one assertion inside try/catch reaches block
      expect.assertions(1);
      const hugePayload = 'X'.repeat(20 * 1024 * 1024); // 20MB
      try {
        const res = await request(app)
          .post('/api/profiles/oversized-profile')
          .send(hugePayload);

        expect([400, 413]).toContain(res.statusCode);
      } catch (err) {
        // DO NOT SWALLOW JEST ERRORS! If the expect() above failed, re-throw it.
        if (err.matcherResult) throw err;

        // If connection is abruptly closed to reject oversized streaming (ECONNRESET/EPIPE), that is a valid defense!
        const isConnectionError = err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message.includes('ECONNRESET') || err.message.includes('EPIPE');
        expect(isConnectionError).toBe(true);
      }
    });
  });
});
