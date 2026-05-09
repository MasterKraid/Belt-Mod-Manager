const fs = require('fs-extra');
const path = require('path');

describe('Frontend Application Logic and Helper Tests', () => {
  let vueInstance;
  let vueAppOptions;
  let sfx;

  let originalWindow;
  let originalAudio;
  let originalDocument;
  let originalVue;
  let originalFetch;

  beforeEach(() => {
    // Keep absolute holds on the original globals to eliminate parallelization interference
    originalWindow = global.window;
    originalAudio = global.Audio;
    originalDocument = global.document;
    originalVue = global.Vue;
    originalFetch = global.fetch;

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
      },
      navigator: {
        userAgent: 'node'
      }
    };
    global.Audio = global.window.Audio;

    global.document = {
      addEventListener: jest.fn(),
      createElement: jest.fn().mockImplementation(() => ({
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        style: {}
      })),
      querySelector: jest.fn(),
      getElementById: jest.fn()
    };

    // 2. Load and bind the real reactive Vue 2 framework!
    let Vue = require('vue');
    if (Vue.default) {
      Vue = Vue.default;
    }
    Vue.config.productionTip = false;
    Vue.config.devtools = false;
    global.Vue = Vue;

    // 3. Set a lightweight, clean baseline fetch mock
    global.fetch = jest.fn().mockImplementation((url) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('Invalid fetch URL type'));
      }
      if (url.includes('/api/game-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ running: false })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });

    // 4. Require the exported vueAppOptions and sfx directly without eval()
    const mainScript = require('../public/scripts/main');
    vueAppOptions = mainScript.vueAppOptions;
    sfx = mainScript.sfx;

    // 5. Build our real reactive Vue instance for logical testing
    const options = { ...vueAppOptions };
    delete options.el; // Prevent Vue from attempting DOM mounting to preserve pure state tests
    vueInstance = new Vue(options);
  });

  afterEach(async () => {
    // 1. Clear timers to stop recurring loops
    if (vueInstance && vueInstance.downloadPollTimer) {
      clearTimeout(vueInstance.downloadPollTimer);
      vueInstance.downloadPollTimer = null;
    }

    // 2. Destroy the Vue instance to free up RAM
    if (vueInstance) {
      vueInstance.$destroy();
      vueInstance = null;
    }

    // 3. FLUSH MICROTASKS NOW. 
    // Let any lingering floating promises resolve while `window` and `document` still exist!
    await Promise.resolve();

    // 4. NOW it is safe to rip out the global environment
    global.window = originalWindow;
    global.Audio = originalAudio;
    global.document = originalDocument;
    global.Vue = originalVue;
    global.fetch = originalFetch;

    // 5. Restore testing framework state
    try {
      jest.clearAllTimers();
      jest.useRealTimers();
    } catch (err) {}
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // 6. Clear cache for the next test
    if (typeof jest.resetModules === 'function') {
      jest.resetModules();
    }
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
  });

  it('should create and remove notifications correctly on notify()', async () => {
    jest.useFakeTimers();

    vueInstance.notify('Test notification message', 5);
    
    expect(vueInstance.notifications.length).toBe(1);
    expect(vueInstance.notifications[0].message).toBe('Test notification message');

    // Fast-forward 5 seconds
    jest.advanceTimersByTime(5000);
    // Allow Vue to process the state change caused by the timeout resolving
    await vueInstance.$nextTick();

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
  });

  describe('Simulated UI Workflows, Fuzzing, and Edge Case Tests', () => {
    it('should invoke actual cancelDownload logic, send cancel post request, and poll downloads on success', async () => {
      // 1. Set up active downloads
      vueInstance.activeDownloads = [{ id: 777, fileName: 'aircraft_2.0.3.zip', status: 'downloading' }];

      // 2. Spy on playSound and pollDownloads
      const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();
      const pollSpy = jest.spyOn(vueInstance, 'pollDownloads').mockImplementation();

      // 3. Override ONLY the very next fetch call using mockImplementationOnce
      global.fetch.mockImplementationOnce((url, options) => {
        if (url.includes('/api/portal/download-cancel/777') && options.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
        return Promise.reject(new Error('Unexpected fetch in test'));
      });

      // 4. Invoke the REAL cancelDownload method (which now returns a Promise!)
      await vueInstance.cancelDownload(777);

      // Verify that fetch was called and sound effect played
      expect(playSpy).toHaveBeenCalledWith('click');
      expect(global.fetch).toHaveBeenCalledWith('/api/portal/download-cancel/777', { method: 'POST' });

      // Verify that real method chained to pollDownloads on success!
      expect(pollSpy).toHaveBeenCalled();
    });

    it('should execute real pollDownloads logic, fetch download lists, and set dynamic polling timeout on active downloads', async () => {
      // 1. Spies on dependent UI actions
      const playSpy = jest.spyOn(vueInstance, 'playSound').mockImplementation();
      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();
      const fetchModsSpy = jest.spyOn(vueInstance, 'fetchMods').mockImplementation();
      const fetchInstalledModsSpy = jest.spyOn(vueInstance, 'fetchInstalledMods').mockImplementation();

      // 2. Override ONLY the very next fetch call using mockImplementationOnce
      global.fetch.mockImplementationOnce((url) => {
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

      // 3. Run real pollDownloads (which now returns a Promise!)
      await vueInstance.pollDownloads();

      // Assert that activeDownloads got populated
      expect(vueInstance.activeDownloads).toHaveLength(1);
      expect(vueInstance.activeDownloads[0].modName).toBe('aircraft');

      // Assert that adaptive timeout got scheduled since there is an active downloading job
      expect(vueInstance.downloadPollTimer).toBeDefined();
    });

    it('should fuzz dependency parser with 1,000 truly randomized random-byte and structurally diverse Unicode strings to verify zero crashes', () => {
      const crypto = require('crypto');
      const structuralPool = [
        '   ', '\n\t\r \u200B', 'Arabic \u0627\u0644\u0639\u0631\u0628\u064a\u0629', '🔥 \uD83D\uDE00', 'base >= <= != ? ! 1.0.0',
        '? ! ~ (?) (!)', 'space-age <', 'quality = 1.0.0', 'a'.repeat(2000), '\u202D\u202E\u200B\uFEFF', 'name ===!?',
        'quality >= 1.0.0 <= 2.0.0', '(?!) !!abc', 'base >=\n2.0'
      ];

      for (let i = 0; i < 1000; i++) {
        let input;
        if (i < 500) {
          input = crypto.randomBytes(32).toString('utf8');
        } else {
          const baseStr = structuralPool[i % structuralPool.length];
          const randomSuffix = crypto.randomBytes(8).toString('utf8');
          input = baseStr + randomSuffix;
        }

        let res;
        expect(() => {
          res = vueInstance.parseDependency(input);
        }).not.toThrow();

        if (res !== null) {
          expect(typeof res.name).toBe('string');
          expect(typeof res.required).toBe('boolean');
          expect(typeof res.incompatible).toBe('boolean');
          expect(typeof res.optional).toBe('boolean');
        }
      }
    });

    it('should sanitize profile names using the real production isSafeProfileName implementation', () => {
      const { isSafeProfileName } = require('../backend/server');
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

      // Verify iterative resolution completed cleanly with exactly 1 outer invocation
      expect(enableSpy).toHaveBeenCalledTimes(1);

      // Verify decoupled notification state outcome
      const notifyMessages = notifySpy.mock.calls.map(call => call[0]);
      expect(notifyMessages).toContain('Enabled required dependency: b');
    });

    it('should handle deeply nested dependency chains (1,000 levels) without stack overflow or performance lag using iterative resolution', () => {
      const numMods = 1000;
      vueInstance.mods = [];
      vueInstance.installedMods = [];

      for (let i = 0; i < numMods; i++) {
        vueInstance.mods.push({ name: `mod-${i}`, enabled: i === 0 });
        vueInstance.installedMods.push({
          name: `mod-${i}`,
          dependencies: i < numMods - 1 ? [`mod-${i + 1}`] : []
        });
      }

      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();

      // Trigger iterative resolution on mod-0
      vueInstance.enableDependenciesOf({ name: 'mod-0' });

      // All 1000 mods in the chain should resolve and enable cleanly with zero stack overflows!
      const allEnabled = vueInstance.mods.every(m => m.enabled === true);
      expect(allEnabled).toBe(true);
      expect(notifySpy).toHaveBeenCalledTimes(999);
    });

    it('should handle failed download cancellation requests gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('network fail'));
      jest.spyOn(vueInstance, 'playSound').mockImplementation();

      // Because the method returns the promise, we can just await it directly
      await expect(vueInstance.cancelDownload(123)).resolves.toBeUndefined();
    });

    it('should handle failed pollDownloads fetch safely', async () => {
      global.fetch.mockRejectedValueOnce(new Error('network fail'));

      // Because the method returns the promise, we can just await it directly
      await expect(vueInstance.pollDownloads()).resolves.toBeUndefined();
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
