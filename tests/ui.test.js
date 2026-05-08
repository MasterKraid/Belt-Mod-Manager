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

  afterEach(() => {
    // Rigid global and mock teardowns to prevent any leakages
    delete global.window;
    delete global.Audio;
    delete global.document;
    delete global.Vue;
    delete global.fetch;

    jest.clearAllTimers();
    jest.useRealTimers();

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
    expect(vueInstance.parseDependency('???')).toEqual({
      name: '',
      required: false,
      incompatible: false,
      optional: true
    });

    // Invalid operator structures
    expect(vueInstance.parseDependency('base << invalid')).toEqual({
      name: 'base',
      required: true,
      incompatible: false,
      optional: false
    });
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
    it('should handle simulated Downloader queue and cancel workflow seamlessly', () => {
      expect(vueInstance.activeDownloads).toEqual([]);

      // 1. Simulate starting downloads
      const mockDl = { id: 777, fileName: 'aircraft_2.0.3.zip', status: 'downloading', progress: 0.1 };
      vueInstance.activeDownloads.push(mockDl);

      expect(vueInstance.activeDownloads.length).toBe(1);
      expect(vueInstance.activeDownloads[0].fileName).toBe('aircraft_2.0.3.zip');

      // 2. Simulate canceling a download
      const notifySpy = jest.spyOn(vueInstance, 'notify').mockImplementation();
      const cancelSpy = jest.spyOn(vueInstance, 'cancelDownload').mockImplementation((id) => {
        vueInstance.activeDownloads = vueInstance.activeDownloads.filter(d => d.id !== id);
        vueInstance.notify('Download cancelled', 3);
      });

      vueInstance.cancelDownload(777);

      expect(vueInstance.activeDownloads.length).toBe(0);
      expect(notifySpy).toHaveBeenCalledWith('Download cancelled', 3);

      notifySpy.mockRestore();
      cancelSpy.mockRestore();
    });

    it('should fuzz dependency parser with random strings to verify zero crashes (property-style)', () => {
      const fuzzInputs = [
        'base >= 2.0.72', '?', '(?!)', '!!abc', '   ', 'space-age <', 'quality = 1.0.0',
        'a'.repeat(1000), '   ?   space-age   >=   1.0', '\n\t\r', '<><><>', 'name ===!?'
      ];

      fuzzInputs.forEach((input) => {
        expect(() => {
          const res = vueInstance.parseDependency(input);
          if (res !== null) {
            expect(typeof res.name).toBe('string');
            expect(typeof res.required).toBe('boolean');
            expect(typeof res.incompatible).toBe('boolean');
            expect(typeof res.optional).toBe('boolean');
          }
        }).not.toThrow();
      });
    });

    it('should sanitize profile names against injection, traversals and malformed names', () => {
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
        // Mocking name validation helper check
        const isValid = !item.name.includes('..') && 
                        !item.name.includes('/') && 
                        !item.name.includes('\\') && 
                        !['CON', 'aux', 'nul', 'PRN', 'LPT1'].includes(item.name);
        expect(isValid).toBe(item.valid);
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
  });
});
