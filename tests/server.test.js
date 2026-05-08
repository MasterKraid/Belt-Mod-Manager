process.env.NODE_ENV = 'test';

const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');
const { app } = require('../server');

const TEST_PROFILES_DIR = path.join(__dirname, '../test-profiles');
const TEST_BACKUP_DIR = path.join(__dirname, '../test-backup');
const TEST_MOD_LIST_DIR = path.join(__dirname, '../test-mod-list');

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
    // Keep tests hermetic and order-independent
    fs.readdirSync(TEST_PROFILES_DIR)
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => fs.removeSync(path.join(TEST_PROFILES_DIR, f)));
  });

  it('GET /api/check-modlist should return exists boolean', async () => {
    const res = await request(app).get('/api/check-modlist');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('exists');
  });

  it('GET /api/profiles should return empty array initially or with default', async () => {
    const res = await request(app).get('/api/profiles');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/profiles/:name should create a new profile', async () => {
    const profileMods = [{ name: 'base', enabled: true }, { name: 'test-mod', enabled: false }];
    const res = await request(app)
      .post('/api/profiles/test-profile')
      .send(profileMods);
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles');
    expect(checkRes.body).toContain('test-profile');
  });

  it('GET /api/profiles/:name should retrieve the created profile', async () => {
    const profileMods = [{ name: 'base', enabled: true }, { name: 'test-mod', enabled: false }];
    await request(app).post('/api/profiles/test-profile').send(profileMods);

    const res = await request(app).get('/api/profiles/test-profile');
    expect(res.statusCode).toEqual(200);
    expect(res.body.find(m => m.name === 'base')).toBeDefined();
    expect(res.body.find(m => m.name === 'test-mod')).toBeDefined();
  });

  it('POST /api/rename-profile should rename an existing profile', async () => {
    const profileMods = [{ name: 'base', enabled: true }, { name: 'test-mod', enabled: false }];
    await request(app).post('/api/profiles/test-profile').send(profileMods);

    const res = await request(app)
      .post('/api/rename-profile')
      .send({ oldName: 'test-profile', newName: 'renamed-profile' });
    expect(res.statusCode).toEqual(200);

    const checkRes = await request(app).get('/api/profiles');
    expect(checkRes.body).toContain('renamed-profile');
    expect(checkRes.body).not.toContain('test-profile');
  });

  it('POST /api/delete-profile should delete an existing profile', async () => {
    const profileMods = [{ name: 'base', enabled: true }, { name: 'test-mod', enabled: false }];
    await request(app).post('/api/profiles/renamed-profile').send(profileMods);

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
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/profiles/:name should 500 when profile JSON is invalid shape', async () => {
    const badPath = path.join(TEST_PROFILES_DIR, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify({ not: 'an array' }, null, 2), 'utf-8');

    const res = await request(app).get('/api/profiles/bad');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/switch/:name should 500 when profile JSON is invalid shape', async () => {
    const badPath = path.join(TEST_PROFILES_DIR, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify({ not: 'an array' }, null, 2), 'utf-8');

    const res = await request(app).post('/api/switch/bad');
    expect(res.statusCode).toEqual(500);
  });

  it('profile routes should 400 on invalid profile name', async () => {
    const res = await request(app).get('/api/profiles/a..b');
    expect(res.statusCode).toEqual(400);

    const res2 = await request(app).post('/api/profiles/evil%5Cname').send([]);
    expect(res2.statusCode).toEqual(400);
  });
});
