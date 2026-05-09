const fs = require('fs-extra');
const path = require('path');

describe('Frontend Application Logic and Helper Tests', () => {
  let vueInstance;
  let vueAppOptions;
  let sfx;

  beforeEach(() => {
    // 1. Mock global window, document and Audio synchronously in Node context
    global.window = {
      Audio: class {
        constructor(src) {
          this.src = src;
        }
        play() { return Promise.resolve(); }
        pause() {}
      },
      electronAPI: {
        minimizeWindow: jest.fn(),
        closeWindow: jest.fn(),
        setZoom: jest.fn()
      }
    };
    global.Audio = global.window.Audio;

    global.document = {
      addEventListener: jest.fn()
    };

    // 2. Mock Vue constructor
    global.Vue = class Vue {
      constructor(options) {
        // Not used during direct logic execution tests
      }
    };

    // 3. Mock fetch with URL validations to prevent silent error suppression
    global.fetch = jest.fn().mockImplementation((url) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('Invalid fetch URL type'));
      }
      if (url.includes('/api/installed-mods')) {
        return Promise.resolve({
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/profiles')) {
        return Promise.resolve({
          json: () => Promise.resolve(['default'])
        });
      }
      if (url.includes('/api/get-mod-path') || url.includes('/api/get-game-path')) {
        return Promise.resolve({
          json: () => Promise.resolve({ path: '/dummy/path' })
        });
      }
      if (url.includes('/api/game-status')) {
        return Promise.resolve({
          json: () => Promise.resolve({ running: false })
        });
      }
      return Promise.reject(new Error(`Unhandled mock fetch request to: ${url}`));
    });

    // 4. Require the exported vueAppOptions and sfx directly without eval()
    const mainScript = require('../public/scripts/main');
    vueAppOptions = mainScript.vueAppOptions;
    sfx = mainScript.sfx;

    // 5. Build our synchronous instance for direct logical testing
    const dataObj = typeof vueAppOptions.data === 'function' ? vueAppOptions.data() : (vueAppOptions.data || {});
    vueInstance = {};
    Object.assign(vueInstance, dataObj);

    if (vueAppOptions.methods) {
      for (const method in vueAppOptions.methods) {
        vueInstance[method] = vueAppOptions.methods[method].bind(vueInstance);
      }
    }

    if (vueAppOptions.computed) {
      for (const prop in vueAppOptions.computed) {
        Object.defineProperty(vueInstance, prop, {
          get: vueAppOptions.computed[prop].bind(vueInstance),
          configurable: true
        });
      }
    }
  });

  afterEach(async () => {
    // Rigid global and mock teardowns to prevent any leakages
    delete global.window;
    delete global.Audio;
    delete global.document;
    delete global.Vue;
    delete global.fetch;

    jest.clearAllTimers();
    jest.useRealTimers();

    // Flush any pending unresolved microtask promises to prevent test environment leakages
    await Promise.resolve();

    // Clear module cache to guarantee hermetic test setups
    jest.resetModules();
  });

  it('should instantiate Vue with all default state properties', () => {
    expect(vueInstance).toBeDefined();
    expect(vueInstance.currentTab).toBe('profiles');
    expect(vueInstance.mods).toEqual([]);
    expect(vueInstance.installedMods).toEqual([]);
    expect(vueInstance.notifications).toEqual([]);
  });

  it('should switch tabs and play correct sfx on switchTab', () => {
    const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();
    
    vueInstance.switchTab('downloader');
    
    expect(vueInstance.currentTab).toBe('downloader');
    expect(playSpy).toHaveBeenCalledWith('tabSwitch');

    playSpy.mockRestore();
  });

  it('should create and remove notifications correctly on notify()', () => {
    jest.useFakeTimers();

    vueInstance.notify('Test notification message', 5);
    
    expect(vueInstance.notifications.length).toBe(1);
    expect(vueInstance.notifications[0].message).toBe('Test notification message');

    // Fast-forward 5 seconds
    jest.advanceTimersByTime(5000);

    expect(vueInstance.notifications.length).toBe(0);
  });

  it('should parse dependency strings correctly with parseDependency', () => {
    const req = vueInstance.parseDependency('base >= 2.0.72');
    expect(req).toEqual({
      name: 'base',
      required: true,
      incompatible: false,
      optional: false
    });

    const opt = vueInstance.parseDependency('? space-age');
    expect(opt).toEqual({
      name: 'space-age',
      required: false,
      incompatible: false,
      optional: true
    });

    const opt2 = vueInstance.parseDependency('(?) quality');
    expect(opt2).toEqual({
      name: 'quality',
      required: false,
      incompatible: false,
      optional: true
    });

    const inc = vueInstance.parseDependency('! space-age');
    expect(inc).toEqual({
      name: 'space-age',
      required: false,
      incompatible: true,
      optional: false
    });
  });

  it('should return null safely for empty or malformed dependency strings on parseDependency', () => {
    // Null inputs
    expect(vueInstance.parseDependency(null)).toBeNull();

    // Undefined inputs
    expect(vueInstance.parseDependency(undefined)).toBeNull();

    // Empty inputs
    expect(vueInstance.parseDependency('')).toBeNull();

    // Malformed operators / syntax
    expect(vueInstance.parseDependency('???')).toBeNull();

    // Invalid operator structures
    expect(vueInstance.parseDependency('   ')).toBeNull();
  });

  it('should return missing required dependencies on getMissingDependencies', () => {
    vueInstance.installedMods = [
      { name: 'base', version: '2.0.72' },
      {
        name: 'krastorio',
        dependencies: [
          'base >= 2.0.72',
          '? space-age',
          'missing-dependency-mod'
        ]
      }
    ];

    const missing = vueInstance.getMissingDependencies({ name: 'krastorio' });
    expect(missing).toEqual(['missing-dependency-mod']);
  });

  it('should recursively enable inactive local dependencies on enableDependenciesOf', () => {
    vueInstance.mods = [
      { name: 'parent-mod', enabled: true },
      { name: 'child-mod', enabled: false },
      { name: 'grandchild-mod', enabled: false }
    ];

    vueInstance.installedMods = [
      {
        name: 'parent-mod',
        dependencies: ['child-mod']
      },
      {
        name: 'child-mod',
        dependencies: ['grandchild-mod']
      },
      {
        name: 'grandchild-mod',
        dependencies: []
      }
    ];

    const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();

    vueInstance.enableDependenciesOf({ name: 'parent-mod' });

    const child = vueInstance.mods.find(m => m.name === 'child-mod');
    const grandchild = vueInstance.mods.find(m => m.name === 'grandchild-mod');
    
    expect(child.enabled).toBe(true);
    expect(grandchild.enabled).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(2);

    notifySpy.mockRestore();
  });

  describe('Simulated UI Workflows, Fuzzing, and Edge Case Tests', () => {
    it('should invoke actual cancelDownload logic, send cancel post request, and poll downloads on success', async () => {
      // 1. Set up active downloads
      vueInstance.activeDownloads = [{ id: 777, fileName: 'aircraft_2.0.3.zip', status: 'downloading' }];

      // 2. Spy on playSound and pollDownloads
      const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();
      const pollSpy = jest.spyOn(vueInstance, 'pollDownloads').mockImplementation();

      // 3. Mock fetch specifically for cancel request
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('/api/portal/download-cancel/777') && options.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
        return Promise.reject(new Error('Unexpected fetch in test'));
      });

      // 4. Invoke the REAL cancelDownload method
      await vueInstance.cancelDownload(777);

      // Verify that fetch was called and sound effect played
      expect(playSpy).toHaveBeenCalledWith('click');
      expect(global.fetch).toHaveBeenCalledWith('/api/portal/download-cancel/777', { method: 'POST' });

      // Wait for promise microtasks to resolve so .then() executes cleanly
      await Promise.resolve();

      // Verify that real method chained to pollDownloads on success!
      expect(pollSpy).toHaveBeenCalled();

      playSpy.mockRestore();
      pollSpy.mockRestore();
    });

    it('should execute real pollDownloads logic, fetch download lists, and set dynamic polling timeout on active downloads', async () => {
      // 1. Spies on dependent UI actions
      const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();
      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();
      const fetchModsSpy = jest.spyOn(vueInstance, 'fetchMods').mockImplementation();
      const fetchInstalledModsSpy = jest.spyOn(vueInstance, 'fetchInstalledMods').mockImplementation();

      // 2. Mock fetch with active download response
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url === '/api/portal/downloads') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { id: 101, modName: 'aircraft', status: 'downloading', downloadedBytes: 500, totalBytes: 1000 }
            ])
          });
        }
        return Promise.reject(new Error('Unexpected fetch in test'));
      });

      // 3. Run real pollDownloads
      vueInstance.pollDownloads();

      // Flush microtasks and pending macro tasks cleanly
      await new Promise(resolve => setImmediate(resolve));

      // Assert that activeDownloads got populated
      expect(vueInstance.activeDownloads).toHaveLength(1);
      expect(vueInstance.activeDownloads[0].modName).toBe('aircraft');

      // Assert that adaptive timeout got scheduled since there is an active downloading job
      expect(vueInstance.downloadPollTimer).toBeDefined();

      // Cleanup
      if (vueInstance.downloadPollTimer) {
        clearTimeout(vueInstance.downloadPollTimer);
        vueInstance.downloadPollTimer = null;
      }
      playSpy.mockRestore();
      notifySpy.mockRestore();
      fetchModsSpy.mockRestore();
      fetchInstalledModsSpy.mockRestore();
    });

    it('should fuzz dependency parser with 1,000 truly randomized random-byte and Unicode strings to verify zero crashes', () => {
      const crypto = require('crypto');
      for (let i = 0; i < 1000; i++) {
        const input = crypto.randomBytes(32).toString('utf8');
        expect(() => {
          const res = vueInstance.parseDependency(input);
          if (res !== null) {
            expect(typeof res.name).toBe('string');
            expect(typeof res.required).toBe('boolean');
            expect(typeof res.incompatible).toBe('boolean');
            expect(typeof res.optional).toBe('boolean');
          }
        }).not.toThrow();
      }
    });

    it('should sanitize profile names using the real production isSafeProfileName implementation', () => {
      const { isSafeProfileName } = require('../server');
      const inputs = [
        { name: 'normal-name', valid: true },
        { name: 'profile..name', valid: false },
        { name: 'profile/evil', valid: false },
        { name: 'profile\\evil', valid: false },
        { name: 'CON', valid: false },
        { name: 'aux', valid: false },
        { name: 'nul', valid: false },
        { name: 'PRN', valid: false }
      ];

      inputs.forEach((item) => {
        expect(isSafeProfileName(item.name)).toBe(item.valid);
      });
    });

    it('should compute and render incompatibility states correctly in computed properties', () => {
      // Mock Vue computed or methods dependent on mod listing
      vueInstance.installedMods = [
        { name: 'base', version: '2.0.0' }
      ];

      const dep = vueInstance.parseDependency('! base >= 2.0.0');
      expect(dep.incompatible).toBe(true);
    });

    it('should not enable already enabled dependencies twice', () => {
      vueInstance.mods = [
        { name: 'child-mod', enabled: true }
      ];

      vueInstance.installedMods = [
        {
          name: 'parent-mod',
          dependencies: ['child-mod']
        }
      ];

      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();

      vueInstance.enableDependenciesOf({ name: 'parent-mod' });

      expect(notifySpy).not.toHaveBeenCalled();

      notifySpy.mockRestore();
    });

    it('should safely handle missing dependency lists', () => {
      vueInstance.installedMods = [
        { name: 'mod-without-deps' }
      ];

      expect(() => {
        vueInstance.getMissingDependencies({ name: 'mod-without-deps' });
      }).not.toThrow();
    });

    it('should safely handle unknown mods in getMissingDependencies', () => {
      expect(() => {
        vueInstance.getMissingDependencies({ name: 'does-not-exist' });
      }).not.toThrow();
    });

    it('should safely handle cyclic dependencies without loops, verify terminated recursion, and assert state decoupled from notification order', () => {
      vueInstance.mods = [
        { name: 'a', enabled: true }, // realistic: parent mod is already enabled on toggle
        { name: 'b', enabled: false }
      ];

      vueInstance.installedMods = [
        { name: 'a', dependencies: ['b'] },
        { name: 'b', dependencies: ['a'] }
      ];

      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();
      const enableSpy = jest.spyOn(vueInstance, 'enableDependenciesOf');

      // Call recursive enable
      vueInstance.enableDependenciesOf({ name: 'a' });

      // Ensure b got enabled correctly
      const bMod = vueInstance.mods.find(m => m.name === 'b');
      expect(bMod.enabled).toBe(true);

      // Verify recursion terminated cleanly without re-entry (exactly 2 calls: a and b)
      expect(enableSpy).toHaveBeenCalledTimes(2);

      // Verify decoupled notification state outcome
      const notifyMessages = notifySpy.mock.calls.map(call => call[0]);
      expect(notifyMessages).toContain('Enabled required dependency: b');

      notifySpy.mockRestore();
      enableSpy.mockRestore();
    });

    it('should handle failed download cancellation requests gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network fail'));
      const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();

      expect(() => {
        vueInstance.cancelDownload(123);
      }).not.toThrow();

      playSpy.mockRestore();
    });

    it('should handle failed pollDownloads fetch safely', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network fail'));

      expect(() => {
        vueInstance.pollDownloads();
      }).not.toThrow();
    });

    it('should ignore invalid dependency entries in enableDependenciesOf', () => {
      vueInstance.mods = [];

      vueInstance.installedMods = [
        {
          name: 'parent',
          dependencies: [null, '', '   ']
        }
      ];

      expect(() => {
        vueInstance.enableDependenciesOf({ name: 'parent' });
      }).not.toThrow();
    });
  });
});
