// Copyright (c) 2026 Kraid | Tathagata S. under Kivx.in. Licensed under the MIT License.
const sfx = {
  click: new Audio('/Assets/sound/button-click.ogg'),
  exit: new Audio('/Assets/sound/exit.ogg'),
  contract: new Audio('/Assets/sound/item-contract.ogg'),
  expand: new Audio('/Assets/sound/item-expand.ogg'),
  runGame: new Audio('/Assets/sound/run-game.ogg'),
  sliderOff: new Audio('/Assets/sound/slider-off.ogg'),
  sliderOn: new Audio('/Assets/sound/slider-on.ogg'),
  tabSwitch: new Audio('/Assets/sound/tab-switch.ogg')
};

const vueAppOptions = {
  el: '#app',
  data: {
    mods: [],
    installedMods: [],
    installedSort: 'name',
    installedSortOpen: false,
    managerSort: 'enabled-first',
    managerSortOpen: false,
    expandedMods: [],
    profiles: [],
    selectedProfile: 'default',
    currentTab: 'profiles',
    editingProfile: null,
    renameInput: '',
    uiScale: 85,
    gameArgs: '',
    maxConcurrent: 3,
    enableSoundEffects: true,
    soundVolume: 80,
    enableBackgroundAnimation: false,
    animationSpeed: 100,
    modUpdates: {},
    isCheckingUpdates: false,
    currentModPath: '',
    gamePath: '',
    status: '',
    notifications: [],
    notifId: 0,
    isGameRunning: false,
    searchQueryManager: '',
    searchQueryInstalled: '',
    dropdownOpen: false,
    profileSearchQuery: '',
    profileSearchQueryPage: '',
    deletingProfileName: null,
    deletingInstalledModName: null,
    deletingInstalledModDepsName: null,
    // Downloader tab
    portalQuery: '',
    portalResults: [],
    portalPagination: { page: 1, pageCount: 1, count: 0 },
    portalSort: 'updated_at',
    portalCategory: '',
    portalTag: '',
    portalVersion: '2.0',
    portalDeprecated: false,
    portalSpaceAge: 'any',
    portalLoading: false,
    portalSearched: false,
    activeDownloads: [],
    hadActiveDownloads: false,
    notifiedDownloads: [],
    includeOptionalDeps: false,
    downloadPollTimer: null,
    downloadPollBytes: {},
    dlSortOpen: false,
    dlCategoryOpen: false,
    dlTagOpen: false,
    dlVersionOpen: false,
    dlSpaceAgeOpen: false,
    showAuthPopup: false,
    showModSettingsPopup: false,
    selectedSettingsMod: null,
    modSettingsData: null,
    categorizedSettings: {},
    activeSettingsTab: 'startup',
    selectedConfigMod: null,
    activeConfigTab: 'startup',
    settingsLoading: false,
    modSettingsError: null,
    modSettingsMap: null,
    modSettingsMetadata: {},
    activeDropdownSettingKey: null,
    configDirty: false,
    configSearchQuery: '',
    showUnsavedModal: false,
    pendingTabAction: null,
    portalAuth: { authenticated: false, username: null },
    showPathsMenu: true,
    authUsername: '',
    authPassword: '',
    authError: '',
    authLoading: false,
    portalCategories: [
      { value: '', label: 'All Categories' },
      { value: 'content', label: 'Content' },
      { value: 'overhaul', label: 'Overhaul' },
      { value: 'tweaks', label: 'Tweaks' },
      { value: 'utilities', label: 'Utilities' },
      { value: 'scenarios', label: 'Scenarios' },
      { value: 'mod-packs', label: 'Mod Packs' },
      { value: 'localizations', label: 'Localizations' },
      { value: 'internal', label: 'Internal' },
      { value: 'no-category', label: 'No Category' }
    ],
    portalTags: [
      { value: '', label: 'All Tags' },
      { value: 'planets', label: 'Planets' },
      { value: 'transportation', label: 'Transportation' },
      { value: 'logistics', label: 'Logistics' },
      { value: 'trains', label: 'Trains' },
      { value: 'combat', label: 'Combat' },
      { value: 'armor', label: 'Armor' },
      { value: 'character', label: 'Character' },
      { value: 'enemies', label: 'Enemies' },
      { value: 'environment', label: 'Environment' },
      { value: 'mining', label: 'Mining' },
      { value: 'fluids', label: 'Fluids' },
      { value: 'logistic-network', label: 'Logistic Network' },
      { value: 'circuit-network', label: 'Circuit Network' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'power', label: 'Power' },
      { value: 'storage', label: 'Storage' },
      { value: 'blueprints', label: 'Blueprints' },
      { value: 'cheats', label: 'Cheats' }
    ],
    portalVersions: [
      { value: 'any', label: 'Any Version' },
      { value: '2.0', label: 'Factorio 2.0' },
      { value: '1.1', label: 'Factorio 1.1' },
      { value: '1.0', label: 'Factorio 1.0' },
      { value: '0.18', label: 'Factorio 0.18' },
      { value: '0.17', label: 'Factorio 0.17' },
      { value: '0.16', label: 'Factorio 0.16' },
      { value: '0.15', label: 'Factorio 0.15' },
      { value: '0.14', label: 'Factorio 0.14' },
      { value: '0.13', label: 'Factorio 0.13' }
    ],
    portalSpaceAgeOptions: [
      { value: 'any', label: 'Space Age: Include' },
      { value: 'compatible', label: 'Space Age: Required' },
      { value: 'exclude', label: 'Space Age: Exclude' }
    ],
    // Logs console
    logs: [],
    showLogs: false,
    isLogsAutoScroll: true,
    // Downloader UI
    isDownloadsMinimized: true
  },
  computed: {
    sortedCategorizedSettings() {
      const query = this.configSearchQuery.toLowerCase().trim();
      const keys = Object.keys(this.categorizedSettings).sort((a, b) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
      });
      const sorted = {};
      keys.forEach(k => {
        const settings = this.categorizedSettings[k];
        if (!query) {
          sorted[k] = settings;
          return;
        }
        if (k.toLowerCase().includes(query)) {
          sorted[k] = settings;
          return;
        }
        let hasMatch = false;
        for (const tab in settings) {
          if (Array.isArray(settings[tab])) {
            for (const s of settings[tab]) {
              if (s.key.toLowerCase().includes(query)) {
                hasMatch = true;
                break;
              }
              const meta = this.modSettingsMetadata[s.key];
              if (meta && meta.title && meta.title.toLowerCase().includes(query)) {
                hasMatch = true;
                break;
              }
            }
          }
          if (hasMatch) break;
        }
        if (hasMatch) {
          sorted[k] = settings;
        }
      });
      return sorted;
    },
    filteredConfigSettings() {
      if (!this.selectedConfigMod || !this.categorizedSettings[this.selectedConfigMod]) {
        return [];
      }
      const settings = this.categorizedSettings[this.selectedConfigMod][this.activeConfigTab] || [];
      const query = this.configSearchQuery.toLowerCase().trim();
      if (!query) {
        return settings;
      }
      if (this.selectedConfigMod.toLowerCase().includes(query)) {
        return settings;
      }
      return settings.filter(s => {
        if (s.key.toLowerCase().includes(query)) return true;
        const meta = this.modSettingsMetadata[s.key];
        if (meta && meta.title && meta.title.toLowerCase().includes(query)) return true;
        return false;
      });
    },
    filteredMods() {
      const query = this.searchQueryManager.toLowerCase().trim();
      let list = [...this.mods];
      if (query) {
        list = list.filter(m =>
          (m.title && m.title.toLowerCase().includes(query)) ||
          (m.name && m.name.toLowerCase().includes(query))
        );
      }

      const coreNames = ['base', 'elevated-rails', 'quality', 'space-age'];
      return list.slice().sort((a, b) => {
        const aCore = coreNames.indexOf(a.name);
        const bCore = coreNames.indexOf(b.name);

        const sortMode = this.managerSort;

        if (sortMode === 'last-downloaded') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          const am = a.mtime || 0;
          const bm = b.mtime || 0;
          if (am !== bm) return bm - am;
        } else if (sortMode === 'update-needed') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          const aHasUpdate = !!this.modUpdates[a.name];
          const bHasUpdate = !!this.modUpdates[b.name];
          if (aHasUpdate && !bHasUpdate) return -1;
          if (!aHasUpdate && bHasUpdate) return 1;
        } else if (sortMode === 'enabled-first') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;

          if (a.enabled && !b.enabled) return -1;
          if (!a.enabled && b.enabled) return 1;
        } else if (sortMode === 'enabled-last') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          if (a.enabled && !b.enabled) return 1;
          if (!a.enabled && b.enabled) return -1;
        } else {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;
        }

        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    },
    filteredInstalledMods() {
      const query = this.searchQueryInstalled.toLowerCase().trim();
      let list = this.installedMods;
      if (query) {
        list = list.filter(m =>
          (m.title && m.title.toLowerCase().includes(query)) ||
          (m.name && m.name.toLowerCase().includes(query)) ||
          (m.author && m.author.toLowerCase().includes(query)) ||
          (m.description && m.description.toLowerCase().includes(query))
        );
      }

      const coreNames = ['base', 'elevated-rails', 'quality', 'space-age'];
      return list.slice().sort((a, b) => {
        const aCore = coreNames.indexOf(a.name);
        const bCore = coreNames.indexOf(b.name);

        const sortMode = this.installedSort;

        if (sortMode === 'last-downloaded') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          const am = a.mtime || 0;
          const bm = b.mtime || 0;
          if (am !== bm) return bm - am;
        } else if (sortMode === 'update-needed') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          const aHasUpdate = !!this.modUpdates[a.name];
          const bHasUpdate = !!this.modUpdates[b.name];
          if (aHasUpdate && !bHasUpdate) return -1;
          if (!aHasUpdate && bHasUpdate) return 1;
        } else if (sortMode === 'enabled-first') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;

          if (a.enabled && !b.enabled) return -1;
          if (!a.enabled && b.enabled) return 1;
        } else if (sortMode === 'enabled-last') {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return 1;
          if (bCore !== -1) return -1;

          if (a.enabled && !b.enabled) return 1;
          if (!a.enabled && b.enabled) return -1;
        } else {
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;
        }

        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    },
    modsWithUpdatesCount() {
      return this.installedMods.filter(m => !!this.modUpdates[m.name]).length;
    },
    filteredDropdownProfiles() {
      const query = this.profileSearchQuery.toLowerCase().trim();
      if (!query) return this.profiles;
      return this.profiles.filter(p => p.toLowerCase().includes(query));
    },
    filteredProfilesList() {
      const query = this.profileSearchQueryPage.toLowerCase().trim();
      if (!query) return this.profiles;
      return this.profiles.filter(p => p.toLowerCase().includes(query));
    },
    portalSortLabel() {
      const labels = {
        updated_at: 'Recently Updated',
        downloads_count: 'Most Downloaded',
        trending_score: 'Trending',
        highlighted: 'Highlighted Mods',
        name: 'Name (A-Z)',
        created_at: 'Newest'
      };
      return labels[this.portalSort] || 'Sort';
    },
    portalTagLabel() {
      const found = this.portalTags.find(t => t.value === this.portalTag);
      return found ? found.label : 'All Tags';
    },
    portalVersionLabel() {
      const found = this.portalVersions.find(v => v.value === this.portalVersion);
      return found ? found.label : 'Factorio: 2.0';
    },
    portalSpaceAgeLabel() {
      const found = this.portalSpaceAgeOptions.find(o => o.value === this.portalSpaceAge);
      return found ? found.label : 'Space Age: Include';
    }
  },
  created() {
    this.initLogsStream();
  },
  methods: {
    updateTooltipOnOverflow(e, text) {
      const target = e.currentTarget.querySelector('.mod-name-clamp') || e.currentTarget;
      if (target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth) {
        e.currentTarget.classList.add('has-tooltip');
        e.currentTarget.setAttribute('data-tooltip', text);
      } else {
        e.currentTarget.classList.remove('has-tooltip');
        e.currentTarget.removeAttribute('data-tooltip');
      }
    },
    initLogsStream() {
      const eventSource = new EventSource('/api/logs-stream');
      eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        this.logs.push(log);
        // Keep a reasonable history on client
        if (this.logs.length > 2000) this.logs.shift();

        if (this.isLogsAutoScroll) {
          this.scrollToBottom();
        }
      };
      eventSource.onerror = (e) => {
        eventSource.close();
        // Attempt to reconnect after 5 seconds
        setTimeout(() => this.initLogsStream(), 5000);
      };
    },
    clearLogs() {
      this.logs = [];
    },
    playSound(name) {
      if (this.enableSoundEffects && sfx[name]) {
        sfx[name].currentTime = 0;
        sfx[name].volume = (this.soundVolume !== undefined ? this.soundVolume / 100 : 0.8);
        sfx[name].play().catch(() => { });
      }
    },
    toggleModStatus(mod) {
      if (mod.enabled) {
        this.playSound('sliderOn');
        this.enableDependenciesOf(mod);
      } else {
        this.playSound('sliderOff');
      }
      this.autoSaveMods();
    },
    parseDependency(depStr) {
      if (!depStr) return null;
      let s = depStr.trim();
      const isOptional = s.startsWith('?') || s.startsWith('~') || s.startsWith('(?)');
      const isIncompatible = s.startsWith('!');
      if (isOptional || isIncompatible) {
        const cleanName = s.replace(/^[?~!(?)]+\s*/, '').split(/\s+/)[0];
        if (!cleanName) return null;
        return {
          name: cleanName,
          required: false,
          incompatible: isIncompatible,
          optional: isOptional
        };
      }
      const parts = s.split(/\s+/);
      const name = parts[0];
      if (!name) return null;
      return {
        name: name,
        required: true,
        incompatible: false,
        optional: false
      };
    },
    enableDependenciesOf(mod) {
      if (!mod || !mod.name) return;
      const visited = new Set();
      const stack = [mod];

      while (stack.length > 0) {
        const current = stack.pop();
        if (visited.has(current.name)) continue;
        visited.add(current.name);

        const installed = this.installedMods.find(m => m.name === current.name);
        if (!installed || !installed.dependencies) continue;

        installed.dependencies.forEach(depStr => {
          if (!depStr || typeof depStr !== 'string' || !depStr.trim()) return;
          const parsed = this.parseDependency(depStr);
          if (parsed && parsed.required) {
            if (visited.has(parsed.name)) return;

            const depMod = this.mods.find(m => m.name === parsed.name);
            if (depMod && !depMod.enabled) {
              depMod.enabled = true;
              this.notify(`Enabled required dependency: ${depMod.title || depMod.name}`);
              stack.push(depMod);
            }
          }
        });
      }
    },
    getMissingDependencies(mod) {
      const installed = this.installedMods.find(m => m.name === mod.name);
      if (!installed || !installed.dependencies) return [];

      const CORE_MODS = ['base', 'elevated-rails', 'quality', 'space-age'];
      const missing = [];
      installed.dependencies.forEach(depStr => {
        const parsed = this.parseDependency(depStr);
        if (parsed && parsed.required && !CORE_MODS.includes(parsed.name)) {
          const isInstalled = this.installedMods.some(m => m.name === parsed.name);
          if (!isInstalled) {
            missing.push(parsed.name);
          }
        }
      });
      return missing;
    },
    downloadDependencies(mod) {
      this.playSound('click');
      const missing = this.getMissingDependencies(mod);
      if (missing.length === 0) return;

      this.notify(`Resolving dependencies for ${mod.title || mod.name}...`, 8);
      fetch('/api/portal/download-with-deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modName: mod.name,
          includeOptional: false
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            this.notify('Error: ' + data.error);
            return;
          }
          const dlCount = (data.downloads || []).length;
          const skipCount = (data.skipped || []).length;
          let msg = `Queued ${dlCount} download${dlCount !== 1 ? 's' : ''}`;
          if (skipCount > 0) msg += `, ${skipCount} already installed`;
          this.notify(msg, 6);
          if (dlCount > 0) {
            this.startDownloadPolling();
          }
        })
        .catch(err => this.notify('Dependency resolution failed: ' + err.message));
    },
    notify(message, duration = 2.5) {
      const id = ++this.notifId;
      this.notifications.push({ id, message, duration });
      setTimeout(() => {
        this.notifications = this.notifications.filter(n => n.id !== id);
      }, duration * 1000);
    },
    minimizeWindow() {
      this.playSound('click');
      if (window.__TAURI__) {
        window.__TAURI__.window.getCurrentWindow().minimize();
      } else if (window.electronAPI && window.electronAPI.minimizeWindow) {
        window.electronAPI.minimizeWindow();
      }
    },
    maximizeWindow() {
      this.playSound('click');
      if (window.__TAURI__) {
        const win = window.__TAURI__.window.getCurrentWindow();
        win.isMaximized().then(maximized => {
          if (maximized) win.unmaximize();
          else win.maximize();
        });
      } else if (window.electronAPI && window.electronAPI.maximizeWindow) {
        window.electronAPI.maximizeWindow();
      }
    },
    closeWindow() {
      this.playSound('exit');
      setTimeout(() => {
        if (window.__TAURI__) {
          window.__TAURI__.window.getCurrentWindow().close();
        } else if (window.electronAPI && window.electronAPI.closeWindow) {
          window.electronAPI.closeWindow();
        }
      }, 300);
    },
    fetchMods() {
      fetch(`/api/profiles/${this.selectedProfile}`)
        .then(res => res.json())
        .then(data => this.mods = data);
    },
    fetchInstalledMods() {
      fetch('/api/installed-mods')
        .then(res => res.json())
        .then(data => {
          this.installedMods = data.map(mod => ({
            ...mod,
            dependencies: Array.isArray(mod.dependencies) ? mod.dependencies : [],
            author: mod.author || 'Unknown',
            description: mod.description || 'No description.'
          }));
          this.checkForModUpdates();
        });
    },

    saveMods() {
      this.playSound('click');
      fetch(`/api/profiles/${this.selectedProfile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.mods)
      })
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => { throw new Error(text); });
          }
          this.notify('Mods saved!');
        })
        .catch(err => {
          console.error('Save failed:', err);
          this.notify(`Save failed: ${err.message}`, 5);
        });
    },
    autoSaveMods() {
      // Silently auto-save mod toggle updates to the active profile on change
      fetch(`/api/profiles/${this.selectedProfile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.mods)
      })
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => { throw new Error(text); });
          }
        })
        .catch(err => {
          console.error('Auto-save failed:', err);
          this.notify(`Auto-save failed: ${err.message}`, 5);
        });
    },
    toggleAll(state) {
      this.playSound('click');
      this.mods.forEach(m => {
        if (m.name === 'base') {
          m.enabled = true;
        } else {
          m.enabled = state;
        }
      });
      this.autoSaveMods();
    },
    loadProfiles() {
      Promise.all([
        fetch('/api/active-profile').then(res => res.json()),
        fetch('/api/profiles').then(res => res.json())
      ]).then(([activeData, profilesData]) => {
        this.selectedProfile = activeData.activeProfile || 'default';
        this.profiles = profilesData;
        if (!profilesData.includes(this.selectedProfile)) {
          this.selectedProfile = profilesData[0] || 'default';
        }
        this.fetchMods();
      });
    },
    createProfile() {
      this.playSound('click');
      const temp = '___new_profile_' + Date.now();
      this.profiles.push(temp);
      this.editingProfile = temp;
      this.renameInput = '';
      this.$nextTick(() => {
        const refs = this.$refs.renameInputRef;
        if (refs) {
          const el = Array.isArray(refs) ? refs[0] : refs;
          if (el) el.focus();
        }
      });
    },
    activateProfile(profileName) {
      if (profileName.startsWith('___new_profile_')) return Promise.resolve();
      this.playSound('sliderOn');
      this.selectedProfile = profileName;
      return fetch(`/api/switch/${profileName}`, { method: 'POST' })
        .then(() => {
          this.fetchMods();
          this.notify(`Switched to ${profileName}`);
        });
    },
    startRename(profileName) {
      this.playSound('click');
      this.editingProfile = profileName;
      this.renameInput = profileName;
      this.$nextTick(() => {
        const refs = this.$refs.renameInputRef;
        if (refs) {
          const el = Array.isArray(refs) ? refs[0] : refs;
          if (el) {
            el.focus();
            el.select();
          }
        }
      });
    },
    cancelRename() {
      this.playSound('click');
      if (this.editingProfile && this.editingProfile.startsWith('___new_profile_')) {
        this.profiles = this.profiles.filter(p => p !== this.editingProfile);
      }
      this.editingProfile = null;
      this.renameInput = '';
    },
    submitRename(oldName) {
      this.playSound('click');
      const newName = this.renameInput.trim();
      if (oldName.startsWith('___new_profile_') && !newName) {
        this.profiles = this.profiles.filter(p => p !== oldName);
        this.cancelRename();
        return;
      }
      if (!newName || newName === oldName) {
        this.cancelRename();
        return;
      }
      fetch(`/api/rename-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName })
      }).then(() => {
        this.editingProfile = null;
        this.renameInput = '';
        if (oldName.startsWith('___new_profile_')) {
          this.activateProfile(newName).then(() => {
            this.loadProfiles();
          });
        } else {
          this.loadProfiles();
        }
      });
    },
    setGamePath() {
      this.playSound('click');
      window.electronAPI.selectFolder().then(folder => {
        if (!folder) return;
        fetch('/api/set-game-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folder })
        }).then(() => {
          this.gamePath = folder;
          this.notify('Game path updated!');
          this.fetchInstalledMods(); // refresh to pick up DLCs
        });
      });
    },
    detectSteamPath() {
      if (this.isGameRunning) return;
      this.playSound('click');
      this.notify('Searching Steam for Factorio installation...');
      fetch('/api/detect-steam-game', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            this.gamePath = data.path;
            this.notify('Factorio detected and path updated!');
            this.fetchInstalledMods(); // refresh to pick up DLCs
          } else {
            this.notify('Game not found on Steam. Opening store page...');
            const url = 'https://store.steampowered.com/app/427520/Factorio/';
            if (window.electronAPI && window.electronAPI.openExternal) {
              window.electronAPI.openExternal(url);
            } else {
              window.open(url, '_blank');
            }
          }
        })
        .catch(err => {
          this.notify('Detection failed: ' + err.message);
        });
    },
    setModPath() {
      this.playSound('click');
      window.electronAPI.selectFolder().then(folder => {
        if (!folder) return;
        fetch('/api/set-mod-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: folder })
        }).then(() => {
          this.currentModPath = folder;
          this.fetchMods();
          this.notify('Mod path updated!');
        });
      });
    },
    toggleExpand(name) {
      const i = this.expandedMods.indexOf(name);
      if (i >= 0) {
        this.expandedMods.splice(i, 1);
        this.playSound('contract');
      } else {
        this.expandedMods.push(name);
        this.playSound('expand');
      }
    },
    launchGame() {
      if (this.isGameRunning || !this.gamePath) return;
      this.playSound('runGame');
      this.notify('Starting Factorio...');
      fetch('/api/launch-game', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            this.notify('Error launching: ' + data.error);
          } else {
            this.isGameRunning = true;
            this.showLogs = true;
            this.notify('Factorio launched successfully!');
          }
        })
        .catch(err => {
          this.notify('Launch failed: ' + err.message);
        });
    },
    toggleDropdown() {
      if (this.isGameRunning) return;
      this.playSound('click');
      this.dropdownOpen = !this.dropdownOpen;
      if (this.dropdownOpen) {
        this.profileSearchQuery = '';
        this.$nextTick(() => {
          if (this.$refs.profileSearch) {
            this.$refs.profileSearch.focus();
          }
        });
      }
    },
    activateProfileFromDropdown(p) {
      if (this.isGameRunning) return;
      this.activateProfile(p);
      this.dropdownOpen = false;
      this.profileSearchQuery = '';
    },
    confirmDeleteProfile(p) {
      if (this.isGameRunning || p === 'default') return;
      this.playSound('click');

      // If it's a temporary unsaved profile, cancel it on the frontend directly
      if (p.startsWith('___new_profile_')) {
        this.profiles = this.profiles.filter(prof => prof !== p);
        this.deletingProfileName = null;
        this.cancelRename();
        this.notify('Temporary profile cancelled.');
        return;
      }

      fetch('/api/delete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p })
      }).then(res => {
        if (res.ok) {
          this.notify(`Profile "${p}" deleted successfully.`);
          this.deletingProfileName = null;
          this.loadProfiles();
          if (this.selectedProfile === p) {
            this.selectedProfile = 'default';
            this.fetchMods();
          }
        } else {
          this.notify('Error deleting profile.');
        }
      }).catch(err => {
        this.notify('Error: ' + err.message);
      });
    },
    confirmDeleteInstalledMod(modName) {
      if (this.isGameRunning) return;
      this.playSound('click');
      fetch('/api/delete-mod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modName })
      }).then(res => {
        if (res.ok) {
          this.notify(`Mod "${modName}" deleted successfully.`);
          this.deletingInstalledModName = null;
          this.fetchMods();
          this.fetchInstalledMods();
          const m = this.portalResults.find(r => r.name === modName);
          if (m) {
            m.installed = false;
          }
        } else {
          this.notify('Error deleting mod.');
        }
      }).catch(err => {
        this.notify('Error: ' + err.message);
      });
    },
    confirmDeleteInstalledModWithDeps(modName) {
      if (this.isGameRunning) return;
      this.playSound('click');
      fetch('/api/delete-mod-with-deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modName })
      }).then(res => res.json())
        .then(data => {
          if (data.deleted && data.deleted.length > 0) {
            const names = data.deleted.join(', ');
            this.notify(`Deleted mod & unused deps: ${names}`);
            data.deleted.forEach(deletedName => {
              const m = this.portalResults.find(r => r.name === deletedName);
              if (m) {
                m.installed = false;
              }
            });
            this.deletingInstalledModDepsName = null;
            this.fetchMods();
            this.fetchInstalledMods();
          } else {
            this.notify('No mods were deleted.');
          }
        }).catch(err => {
          this.notify('Error: ' + err.message);
        });
    },
    openModFolder() {
      this.playSound('click');
      fetch('/api/open-mod-folder', { method: 'POST' })
        .then(res => {
          if (res.ok) {
            this.notify('Opened mod storage directory.');
          } else {
            this.notify('Could not open folder.');
          }
        })
        .catch(err => {
          this.notify('Error: ' + err.message);
        });
    },

    // --- Downloader Tab ---
    portalSearch(page, silent = false) {
      if (this.portalLoading) return;
      if (!silent) this.playSound('click');
      this.portalLoading = true;
      this.portalSearched = true;
      const q = this.portalQuery.trim();
      const params = new URLSearchParams({
        q: q,
        page: page || 1,
        page_size: 15,
        sort: this.portalSort,
        category: this.portalCategory,
        tag: this.portalTag,
        version: this.portalVersion,
        include_deprecated: this.portalDeprecated ? 'true' : 'false',
        space_age: this.portalSpaceAge
      });
      fetch(`/api/portal/search?${params}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            this.notify('Search error: ' + data.error);
            this.portalResults = [];
          } else {
            this.portalResults = data.results || [];
            if (data.pagination) {
              this.portalPagination = {
                page: data.pagination.page || 1,
                pageCount: data.pagination.page_count || 1,
                count: data.pagination.count || 0
              };
            }
          }
        })
        .catch(err => {
          this.notify('Search failed: ' + err.message);
          this.portalResults = [];
        })
        .finally(() => { this.portalLoading = false; });
    },

    getDownloadStatus(modName) {
      const job = this.activeDownloads.find(d => d.modName === modName);
      return job ? job.status : null;
    },
    isModDownloading(modName) {
      const status = this.getDownloadStatus(modName);
      return ['downloading', 'queued', 'retrying'].includes(status);
    },
    downloadMod(mod) {
      if (!mod.latest_release) return;
      this.playSound('click');
      this.notify(`Downloading ${mod.title}...`);
      fetch('/api/portal/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modName: mod.name,
          version: mod.latest_release.version,
          fileName: mod.latest_release.file_name,
          officialDownloadUrl: mod.latest_release.download_url
        })
      })
        .then(res => res.json())
        .then(() => {
          this.startDownloadPolling();
        })
        .catch(err => this.notify('Download error: ' + err.message));
    },

    downloadModWithDeps(mod) {
      if (!mod.latest_release) return;
      this.playSound('click');
      this.notify(`Resolving dependencies for ${mod.title}...`, 8);
      fetch('/api/portal/download-with-deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modName: mod.name,
          includeOptional: this.includeOptionalDeps
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            this.notify('Error: ' + data.error);
            return;
          }
          const dlCount = (data.downloads || []).length;
          const skipCount = (data.skipped || []).length;
          let msg = `Queued ${dlCount} download${dlCount !== 1 ? 's' : ''}`;
          if (skipCount > 0) msg += `, ${skipCount} already installed`;
          this.notify(msg, 6);
          this.startDownloadPolling();
        })
        .catch(err => this.notify('Dependency resolution failed: ' + err.message));
    },

    startDownloadPolling() {
      if (this.downloadPollTimer) return;
      this.downloadPollBytes = {};
      this.pollDownloads(0);
    },

    stopDownloadPolling() {
      if (this.downloadPollTimer) {
        clearTimeout(this.downloadPollTimer);
        this.downloadPollTimer = null;
      }
    },

    pollDownloads(nextDelayMs) {
      if (this.downloadPollTimer) {
        clearTimeout(this.downloadPollTimer);
        this.downloadPollTimer = null;
      }
      return fetch('/api/portal/downloads')
        .then(res => res.json())
        .then(data => {
          this.activeDownloads = data || [];
          // Mark completed items as installed immediately
          this.activeDownloads.forEach(job => {
            if (job.status === 'complete') {
              const m = this.portalResults.find(r => r.name === job.modName);
              if (m) {
                m.installed = true;
              }

              if (!this.notifiedDownloads.includes(job.id)) {
                this.notifiedDownloads.push(job.id);
                this.notify(`Downloaded and installed: ${job.modName} (v${job.version})`);
                this.playSound('click');
                this.fetchInstalledMods();
                this.fetchMods();
              }
            }
          });
          const list = data || [];
          const hasActive = list.some(d => ['downloading', 'queued', 'retrying'].includes(d.status));

          if (hasActive) {
            this.hadActiveDownloads = true;
          }

          if (!hasActive && this.downloadPollTimer) {
            const wasActiveBatch = this.hadActiveDownloads;
            this.hadActiveDownloads = false;

            // All done — do a final poll after a brief delay, then stop
            setTimeout(() => {
              this.stopDownloadPolling();
              this.fetchMods();
              this.fetchInstalledMods();
              this.checkUpdates();

              if (wasActiveBatch) {
                if (this.currentTab !== 'downloader') {
                  const completedJobs = list.filter(j => j.status === 'complete');
                  let msg = 'Downloads complete: All mods have been successfully installed.';
                  if (completedJobs.length > 0) {
                    const names = completedJobs.map(j => j.modName).join(', ');
                    msg = `Downloaded ${completedJobs.length} mod${completedJobs.length !== 1 ? 's' : ''} successfully: ${names}`;
                  }
                  this.notify(msg, 6);
                  this.playSound('click');
                }
              }
            }, 1000);
            return;
          }

          if (!hasActive) return;

          // Adaptive polling:
          // - Fast while bytes are changing (active download progress)
          // - Slower while queued/retrying or stalled
          let anyByteChange = false;
          let anyDownloading = false;
          list.forEach(job => {
            if (job.status === 'downloading') anyDownloading = true;
            const key = String(job.id);
            const prev = this.downloadPollBytes[key] || 0;
            const now = job.downloadedBytes || 0;
            if (now > prev) anyByteChange = true;
            this.downloadPollBytes[key] = now;
          });

          let delay = 2000;
          if (anyDownloading && anyByteChange) delay = 600;
          else if (anyDownloading) delay = 1200;
          else delay = 2000;

          this.downloadPollTimer = setTimeout(() => this.pollDownloads(delay), delay);
        })
        .catch(() => { });
    },

    cancelDownload(id) {
      this.playSound('click');
      return fetch(`/api/portal/download-cancel/${id}`, { method: 'POST' })
        .then(() => this.pollDownloads())
        .catch(() => { });
    },

    clearDownloads() {
      this.playSound('click');
      return fetch('/api/portal/downloads-clear', { method: 'POST' })
        .then(() => {
          this.activeDownloads = [];
          this.stopDownloadPolling();
        })
        .catch(() => { });
    },

    formatDownloads(n) {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    },

    formatBytes(bytes) {
      if (!bytes) return '0 B';
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return bytes + ' B';
    },

    // --- Auth ---
    fetchAuthStatus() {
      fetch('/api/portal/auth-status')
        .then(res => res.json())
        .then(data => { this.portalAuth = data; })
        .catch(() => { });
    },

    saveAuthCredentials() {
      if (!this.authUsername || !this.authPassword) return;
      this.playSound('click');
      this.authError = '';
      this.authLoading = true;
      fetch('/api/portal/auth-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.authUsername, password: this.authPassword })
      })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          this.authLoading = false;
          if (ok && data.success) {
            this.notify('Authenticated successfully!');
            this.portalAuth = { authenticated: true, username: data.username };
            this.authUsername = '';
            this.authPassword = '';
            this.authError = '';
            this.showAuthPopup = false;
          } else {
            this.authError = data.error || 'Authentication failed';
          }
        })
        .catch(err => {
          this.authLoading = false;
          this.authError = 'Connection error: ' + err.message;
        });
    },

    clearAuthCredentials() {
      this.playSound('click');
      fetch('/api/portal/auth-clear', { method: 'POST' })
        .then(res => res.json())
        .then(() => {
          this.portalAuth = { authenticated: false, username: null };
          this.notify('Credentials removed.');
          this.showAuthPopup = false;
        })
        .catch(err => this.notify('Error: ' + err.message));
    },

    closeDlDropdowns() {
      this.dlSortOpen = false;
      this.dlCategoryOpen = false;
      this.dlTagOpen = false;
      this.dlVersionOpen = false;
      this.dlSpaceAgeOpen = false;
      this.installedSortOpen = false;
      this.managerSortOpen = false;
    },

    closeAllDropdownsExcept(except) {
      const list = ['dlSortOpen', 'dlCategoryOpen', 'dlTagOpen', 'dlVersionOpen', 'dlSpaceAgeOpen'];
      list.forEach(item => {
        if (item !== except) {
          this[item] = false;
        }
      });
    },

    openModPage(modName) {
      const url = `https://mods.factorio.com/mod/${encodeURIComponent(modName)}`;
      if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    },

    async openModSettings(mod) {
      this.selectedSettingsMod = mod;
      this.activeSettingsTab = 'startup';
      this.showModSettingsPopup = true;
      if (!this.modSettingsData && this.currentModPath) {
        await this.loadModSettingsDat();
      }
    },
    async loadModSettingsDat() {
      this.settingsLoading = true;
      try {
        // Step 1: Decode the mod-settings.dat file
        const settingsRes = await fetch('/api/mod-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: this.currentModPath + '/mod-settings.dat' })
        });
        if (!settingsRes.ok) throw new Error(await settingsRes.text());
        const jsonStr = await settingsRes.json();
        this.modSettingsData = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;

        // Step 2: Fetch settings→mod map, passing actual setting keys for concatenation resolution
        if (!this.modSettingsMap) {
          const allKeys = [];
          ['startup', 'runtime-global', 'runtime-per-user'].forEach(scope => {
            if (this.modSettingsData.settings[scope]) {
              allKeys.push(...Object.keys(this.modSettingsData.settings[scope]));
            }
          });
          
          const mapRes = await fetch('/api/mod-settings-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: allKeys })
          });
          
          if (mapRes.ok) {
            this.modSettingsMap = await mapRes.json();
            console.log(`[Config] Loaded ${Object.keys(this.modSettingsMap).length} setting→mod mappings from mod ZIPs`);
          } else {
            console.error(`[Config] Failed to load settings map: ${mapRes.status} ${mapRes.statusText}`);
          }
        }

        // Fetch settings metadata
        try {
          const metaRes = await fetch('/api/mod-settings-metadata');
          if (metaRes.ok) {
            this.modSettingsMetadata = await metaRes.json();
            console.log(`[Config] Loaded settings metadata for ${Object.keys(this.modSettingsMetadata).length} settings`);
          }
        } catch (metaErr) {
          console.error('[Config] Failed to fetch settings metadata:', metaErr);
        }

        this.parseAndCategorizeSettings(this.modSettingsData);
      } catch (e) {
        console.error("Failed to load mod-settings.dat", e);
        this.modSettingsError = String(e);
      } finally {
        this.settingsLoading = false;
        // Ensure we reset dirty state after loading
        this.$nextTick(() => { this.configDirty = false; });
      }
    },
    parseAndCategorizeSettings(data) {
      // Build prefix matcher from ALL installed mods (most comprehensive) + active profile
      const allMods = [...(this.installedMods || []), ...(this.mods || [])];
      let modNames = [...new Set(allMods.map(m => m.name))];
      console.log(`[Config] Matching settings against ${modNames.length} unique mod names`);
      const builtIn = ['base', 'core', 'elevated-rails', 'quality', 'space-age', 'scenario', 'level', 'util', 'utility'];
      builtIn.forEach(b => {
        if (!modNames.includes(b)) modNames.push(b);
      });

      // Sort by length descending to match longest prefixes first
      modNames.sort((a, b) => b.length - a.length);

      // Primary: use the definitive settings→mod map extracted from settings.lua files
      const settingsMap = this.modSettingsMap || {};

      const categorized = {};
      let mapHits = 0, heuristicHits = 0, uncategorized = 0;

      ['startup', 'runtime-global', 'runtime-per-user'].forEach(scope => {
        if (!data.settings[scope]) return;

        Object.keys(data.settings[scope]).forEach(key => {
          let matchedMod = 'Uncategorized';
          const lowerKey = key.toLowerCase();

          // Primary: Check definitive map from settings.lua parsing
          if (settingsMap[key]) {
            matchedMod = settingsMap[key];
            mapHits++;
          }

          // Fallback: heuristic matching only if not found in map
          if (matchedMod === 'Uncategorized') {

            const abbreviations = {
              'ee': 'EditorExtensions',
              'bnl': 'BottleneckLite',
              'sqt': 'SqueakThrough',
              'bb': 'UltimateBelts',
              'charxpmod': 'CharacterXP',
              'vehphy': 'VehiclePhysics',
              'ion-cannon': 'SpaceModIonCannon',
              'bobmods': 'boblibrary',
              'lex': 'Lex_Aircraft',
              'aspr': 'Automatic_Station_Painter_Redux',
              'vibPaint': 'vibrant-paint',
              'Factorissimo2': 'Factorissimo2',
              'PCPBU': 'Power_Configurable_Picker_Belt_Upgrader'
            };

            // Pre-process for efficiency
            const lowerModMap = modNames.map(name => ({
              original: name,
              lower: name.toLowerCase(),
              norm: name.toLowerCase().replace(/[-_ ]/g, ''),
              initials: name.split(/[-_ ]/).map(word => word[0]).join('').toLowerCase(),
              firstWord: name.toLowerCase().split(/[-_ ]/)[0]
            }));

            // Pass 1: Standard & Normalized & Substring
            for (const m of lowerModMap) {
              // 1a. Standard prefix (e.g. mod-name-)
              if (lowerKey.startsWith(m.lower + '-') || lowerKey.startsWith(m.lower + '_') || lowerKey.startsWith(m.lower + '.') || lowerKey === m.lower) {
                matchedMod = m.original;
                break;
              }
              // 1b. Substring (e.g. factorissimo2 in factorissimo2-alt-graphics)
              if (m.lower.length > 3 && lowerKey.includes(m.lower)) {
                matchedMod = m.original;
                break;
              }
              // 1c. Normalized start (ignores all separators)
              const normKey = lowerKey.replace(/[-_ ]/g, '');
              if (normKey.startsWith(m.norm)) {
                matchedMod = m.original;
                break;
              }
            }

            // Pass 2: Hardcoded Abbreviations
            if (matchedMod === 'Uncategorized') {
              for (const [abbr, realName] of Object.entries(abbreviations)) {
                if (lowerKey.startsWith(abbr.toLowerCase())) {
                  const normReal = realName.toLowerCase().replace(/[-_ ]/g, '');
                  const found = lowerModMap.find(m => m.norm === normReal);
                  if (found) {
                    matchedMod = found.original;
                    break;
                  }
                }
              }
            }

            // Pass 3: Initials & Word-based Matching
            if (matchedMod === 'Uncategorized') {
              for (const m of lowerModMap) {
                if (m.initials.length > 1 && (lowerKey.startsWith(m.initials + '-') || lowerKey.startsWith(m.initials + '_'))) {
                  matchedMod = m.original;
                  break;
                }
                if (m.firstWord.length > 3 && (lowerKey.startsWith(m.firstWord + '-') || lowerKey.startsWith(m.firstWord + '_'))) {
                  matchedMod = m.original;
                  break;
                }
              }
            }

            // Pass 4: Title matching
            if (matchedMod === 'Uncategorized') {
              const checkPool = [...(this.installedMods || []), ...(this.mods || [])];
              for (const m of checkPool) {
                if (!m.title) continue;
                const lowerTitle = m.title.toLowerCase();
                const normTitle = lowerTitle.replace(/[-_ ]/g, '');
                const normKey = lowerKey.replace(/[-_ ]/g, '');

                if (normKey.startsWith(normTitle) || (lowerTitle.length > 3 && lowerKey.includes(lowerTitle))) {
                  matchedMod = m.name;
                  break;
                }
              }
            }

            // Pass 5: Aggressive Best-Guess (Word-by-word)
            if (matchedMod === 'Uncategorized' && (lowerKey.includes('-') || lowerKey.includes('_'))) {
              const parts = lowerKey.split(/[-_ ]/);
              for (let i = 0; i < parts.length; i++) {
                const fragment = parts.slice(0, i + 1).join('');
                if (fragment.length > 3) {
                  const found = lowerModMap.find(m => m.norm.startsWith(fragment) || fragment.startsWith(m.norm));
                  if (found) {
                    matchedMod = found.original;
                    break;
                  }
                }
              }
            }

          } // end heuristic fallback block

          if (matchedMod !== 'Uncategorized') {
            if (!settingsMap[key]) heuristicHits++;
          } else {
            uncategorized++;
            console.log("[Config] Still Uncategorized:", key);
          }

          if (!categorized[matchedMod]) {
            categorized[matchedMod] = { 'startup': [], 'runtime-global': [], 'runtime-per-user': [] };
          }

          const value = data.settings[scope][key];
          const metaType = data.metadata[scope] ? data.metadata[scope][key] : null;

          categorized[matchedMod][scope].push({
            key,
            value,
            metaType,
            scope
          });
        });
      });

      console.log(`[Config] Categorization: ${mapHits} from map, ${heuristicHits} from heuristics, ${uncategorized} uncategorized`);
      this.categorizedSettings = categorized;
    },
    async saveModSettingsDat() {
      if (!this.modSettingsData) return;

      // Reconstruct the flat JSON from the categorized model
      Object.keys(this.categorizedSettings).forEach(modName => {
        ['startup', 'runtime-global', 'runtime-per-user'].forEach(scope => {
          this.categorizedSettings[modName][scope].forEach(item => {
            if (this.modSettingsData.settings[scope] && this.modSettingsData.settings[scope][item.key] !== undefined) {
              this.modSettingsData.settings[scope][item.key] = item.value;
            }
          });
        });
      });

      try {
        const path = this.currentModPath + '/mod-settings.dat';
        const res = await fetch('/api/mod-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            data: this.modSettingsData
          })
        });
        if (!res.ok) throw new Error(await res.text());
        this.configDirty = false;
        this.showUnsavedModal = false;
        this.showNotification('Mod settings saved successfully!');

        // Execute pending action if any
        if (this.pendingTabAction) {
          const action = this.pendingTabAction;
          this.pendingTabAction = null;
          if (action.type === 'mainTab') this.currentTab = action.value;
          else if (action.type === 'subTab') this.activeConfigTab = action.value;
          else if (action.type === 'mod') {
            this.selectedConfigMod = action.value;
            this.activeConfigTab = 'startup';
          }
        }
      } catch (e) {
        console.error("Failed to save mod settings", e);
        this.showNotification('Failed to save settings!', 'error');
      }
    },
    rgbToHex(r, g, b) {
      const toHex = (n) => {
        const val = Math.max(0, Math.min(255, Math.round((n || 0) * 255)));
        return val.toString(16).padStart(2, '0');
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },
    updateColorFromHex(settingVal, hex) {
      if (!hex || hex.length !== 7) return;
      settingVal.r = parseInt(hex.slice(1, 3), 16) / 255;
      settingVal.g = parseInt(hex.slice(3, 5), 16) / 255;
      settingVal.b = parseInt(hex.slice(5, 7), 16) / 255;
    },
    updateSettingJSON(setting, rawString) {
      try {
        setting.value = JSON.parse(rawString);
      } catch (e) {
        // Ignore parse errors while typing
      }
    },
    saveSettingsConfig() {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userModPath: this.currentModPath,
          userGamePath: this.gamePath,
          uiScale: parseInt(this.uiScale) || 100,
          gameArgs: this.gameArgs,
          maxConcurrent: parseInt(this.maxConcurrent) || 3,
          enableSoundEffects: this.enableSoundEffects,
          soundVolume: parseInt(this.soundVolume) || 80,
          enableBackgroundAnimation: this.enableBackgroundAnimation,
          animationSpeed: parseInt(this.animationSpeed) || 100,
          showPathsMenu: this.showPathsMenu
        })
      })
        .then(res => res.json())
        .catch(err => this.notify('Failed to save settings: ' + err.message));
    },
    applyUiScaling() {
      document.body.style.setProperty('--zoom-factor', (this.uiScale / 100));
      document.body.style.zoom = (this.uiScale / 100);
      this.applyAnimationSpeed();
    },
    applyAnimationSpeed() {
      const speed = parseFloat(this.animationSpeed) || 100;
      const duration = 6 / (speed / 100);
      document.documentElement.style.setProperty('--bg-anim-duration', duration + 's');
    },
    resetAnimationSpeed() {
      this.animationSpeed = 100;
      this.applyAnimationSpeed();
      this.saveSettingsConfig();
      this.playSound('click');
    },
    detectSteamPath() {
      this.playSound('click');
      this.notify('Detecting Steam Factorio path...');
      fetch('/api/detect-steam-game', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            this.gamePath = data.path;
            this.notify('Factorio detected: ' + data.path);
            this.saveSettingsConfig();
          } else {
            this.notify('Steam Factorio not detected.');
          }
        })
        .catch(err => this.notify('Detection failed: ' + err.message));
    },
    openModsFolder() {
      this.playSound('click');
      fetch('/api/open-mod-folder', { method: 'POST' })
        .catch(err => this.notify('Failed to open mods folder: ' + err.message));
    },
    clearDownloadsHistory() {
      this.playSound('click');
      fetch('/api/portal/downloads-clear', { method: 'POST' })
        .then(() => {
          this.activeDownloads = [];
          this.notify('Downloads history cleared.');
        })
        .catch(err => this.notify('Failed to clear history: ' + err.message));
    },
    checkForModUpdates() {
      if (this.isCheckingUpdates || this.activeDownloads.some(d => ['downloading', 'queued', 'retrying'].includes(d.status))) return;
      this.isCheckingUpdates = true;
      fetch('/api/mods/check-updates')
        .then(res => res.json())
        .then(updates => {
          this.modUpdates = updates || {};
        })
        .catch(() => { })
        .finally(() => {
          this.isCheckingUpdates = false;
        });
    },
    downloadModUpdate(modName, targetVersion, keepOldVersion = false) {
      this.playSound('click');
      this.notify(`Updating ${modName} to v${targetVersion}...`);
      fetch('/api/portal/download-with-deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modName: modName,
          includeOptional: false,
          keepOldVersion: keepOldVersion
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            this.notify('Error: ' + data.error);
            return;
          }
          this.notify(`Queued update for ${modName}.`);
          this.startDownloadPolling();
        })
        .catch(err => this.notify('Update queueing failed: ' + err.message));
    },
    async updateAllMods() {
      this.playSound('click');
      const updates = this.installedMods.filter(m => !!this.modUpdates[m.name]);
      if (updates.length === 0) return;

      this.notify(`Queuing ${updates.length} mod updates...`);

      try {
        const promises = updates.map(mod => {
          return fetch('/api/portal/download-with-deps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modName: mod.name,
              includeOptional: false
            })
          }).then(res => res.json());
        });

        await Promise.all(promises);

        // Start polling immediately after queuing
        this.startDownloadPolling();
        this.notify('Bulk update started. Check Downloader tab for progress.');
      } catch (err) {
        console.error('Bulk update failed:', err);
        this.notify('Bulk update failed to queue some mods.');
        this.startDownloadPolling(); // Still poll for whatever did succeed
      }
    },
    // Navigation Guards for Unsaved Config
    async switchTab(tab) {
      if (this.currentTab === 'config' && this.configDirty) {
        this.pendingTabAction = { type: 'mainTab', value: tab };
        this.showUnsavedModal = true;
        return;
      }

      if (this.currentTab !== tab) {
        this.currentTab = tab;
        this.playSound('tabSwitch');
        // Load settings if entering config tab for the first time
        if (tab === 'config' && !this.modSettingsData && this.currentModPath) {
          await this.loadModSettingsDat();
        }
      }
    },
    switchConfigSubTab(scope) {
      if (this.configDirty) {
        this.pendingTabAction = { type: 'subTab', value: scope };
        this.showUnsavedModal = true;
        return;
      }
      this.activeConfigTab = scope;
      this.playSound('click');
    },
    switchConfigMod(modName) {
      if (this.configDirty) {
        this.pendingTabAction = { type: 'mod', value: modName };
        this.showUnsavedModal = true;
        return;
      }
      this.selectedConfigMod = modName;
      this.activeConfigTab = 'startup';
      this.playSound('click');
    },
    confirmDiscardChanges() {
      this.configDirty = false;
      this.showUnsavedModal = false;
      const action = this.pendingTabAction;
      this.pendingTabAction = null;

      if (!action) return;

      if (action.type === 'mainTab') this.currentTab = action.value;
      else if (action.type === 'subTab') this.activeConfigTab = action.value;
      else if (action.type === 'mod') {
        this.selectedConfigMod = action.value;
        this.activeConfigTab = 'startup';
      }

      // Re-load settings to discard changes in memory
      this.loadModSettingsDat();
      this.playSound('click');
    },
    scrollToBottom() {
      if (!this.showLogs) return;
      this.$nextTick(() => {
        const el = this.$refs.logsContainer;
        if (el) {
          el.scrollTop = el.scrollHeight;
          // Double-check after a short delay for layout shifts
          setTimeout(() => {
            if (this.isLogsAutoScroll && el) el.scrollTop = el.scrollHeight;
          }, 50);
        }
      });
    },
    handleLogScroll(e) {
      if (this.isLogsAutoScroll) {
        const el = e.target;
        // If locked, don't let them scroll up. Snap back.
        if (el.scrollTop < el.scrollHeight - el.clientHeight - 2) {
          el.scrollTop = el.scrollHeight;
        }
      }
    }
  },
  watch: {
    categorizedSettings: {
      handler() {
        if (this.settingsLoading) return;
        this.configDirty = true;
      },
      deep: true
    },
    mods: {
      handler() {
        if (this.modSettingsData) {
          this.parseAndCategorizeSettings(this.modSettingsData);
        }
      },
      deep: true
    },
    installedMods: {
      handler() {
        // When full mod metadata is loaded, re-categorize to catch Titles and real names
        if (this.modSettingsData) {
          this.parseAndCategorizeSettings(this.modSettingsData);
        }
      },
      deep: true
    },
    showLogs(val) {
      if (val && this.isLogsAutoScroll) {
        this.scrollToBottom();
      }
    },
    isLogsAutoScroll(val) {
      if (val) {
        this.scrollToBottom();
      }
    },
    logs() {
      if (this.isLogsAutoScroll) {
        this.scrollToBottom();
      }
    }
  },
  mounted() {
    this.loadProfiles();
    fetch('/api/config')
      .then(res => res.json())
      .then(config => {
        this.currentModPath = config.userModPath;
        this.gamePath = config.userGamePath;
        this.uiScale = config.uiScale || 100;
        this.gameArgs = config.gameArgs || '';
        this.maxConcurrent = config.maxConcurrent || 3;
        this.enableSoundEffects = config.enableSoundEffects !== false;
        this.soundVolume = config.soundVolume !== undefined ? config.soundVolume : 80;
        this.enableBackgroundAnimation = config.enableBackgroundAnimation || false;
        this.animationSpeed = config.animationSpeed || 100;
        this.showPathsMenu = config.showPathsMenu !== undefined ? config.showPathsMenu : true;
        this.applyUiScaling();

        // Check for mod updates automatically after start up
        setTimeout(() => this.checkForModUpdates(), 3000);
        // Poll updates check every 3 minutes
        setInterval(() => this.checkForModUpdates(), 180000);
      });
    // Defer mod scanning fetch to allow initial paint to happen first.
    requestAnimationFrame(() => this.fetchInstalledMods());
    this.fetchAuthStatus();
    this.portalSearch(1, true);

    // Dismiss the custom dropdown on click-away
    document.addEventListener('click', () => {
      this.dropdownOpen = false;
      this.closeDlDropdowns();
      this.activeDropdownSettingKey = null;
    });

    // Disable default browser right-click context menu
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Disable middle click actions and auto-scroll pasting
    document.addEventListener('mousedown', e => {
      if (e.button === 1) e.preventDefault();
    });
    document.addEventListener('auxclick', e => {
      if (e.button === 1) e.preventDefault();
    });

    // Disable text/asset dragging on anything other than inputs
    document.addEventListener('dragstart', e => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    // Global Custom Tooltip Event Delegation
    const tooltipEl = document.createElement('div');
    tooltipEl.id = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    let activeTooltipTarget = null;

    document.addEventListener('mouseover', e => {
      const target = e.target.closest('.has-tooltip');
      if (!target) return;

      // If the mouse is still within the same active target, bypass re-rendering completely to prevent flickering!
      if (target === activeTooltipTarget) return;
      activeTooltipTarget = target;

      const text = target.getAttribute('data-tooltip') || target.getAttribute('title');
      if (!text) {
        activeTooltipTarget = null;
        return;
      }

      // Ensure title attribute is converted to data-tooltip to avoid standard browser tooltips
      if (target.hasAttribute('title')) {
        target.setAttribute('data-tooltip', text);
        target.removeAttribute('title');
      }

      tooltipEl.textContent = text.replace(/\\n/g, '\n');

      // 1. Reset classes and transitions to measure size accurately
      tooltipEl.className = '';
      tooltipEl.style.transition = 'none';
      tooltipEl.style.visibility = 'hidden';
      tooltipEl.style.display = 'block';

      // Measure target element position and get current body zoom factor
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      const configPane = target.closest('.config-settings-pane');
      if (configPane) {
        const paneRect = configPane.getBoundingClientRect();
        const paneWidthZoomed = paneRect.width / zoom;
        const maxW = Math.min(400, paneWidthZoomed - 40);
        tooltipEl.style.maxWidth = maxW + 'px';
      } else {
        tooltipEl.style.maxWidth = '320px';
      }

      // 2. Measure tooltip real size
      const tooltipWidth = tooltipEl.offsetWidth;
      const tooltipHeight = tooltipEl.offsetHeight;

      // 3. Measure target element position and get zoomed coordinates
      const targetRect = target.getBoundingClientRect();

      // Convert all viewport coordinates to zoomed coordinates by dividing by the zoom factor
      const targetLeftZoomed = targetRect.left / zoom;
      const targetWidthZoomed = targetRect.width / zoom;
      const targetCenterZoomed = targetLeftZoomed + (targetWidthZoomed / 2);
      const targetTopZoomed = targetRect.top / zoom;
      const targetBottomZoomed = targetRect.bottom / zoom;

      // 4. Calculate coordinates relative to viewport scaled by zoom
      let tooltipLeft = targetCenterZoomed - (tooltipWidth / 2);
      let tooltipTop = targetTopZoomed - tooltipHeight - 8; // 8px space above
      let isBelow = false;

      // 5. Force below if target has tooltip-below class or data-tooltip-position="below"
      const forceBelow = target.classList.contains('tooltip-below') || target.getAttribute('data-tooltip-position') === 'below';
      if (forceBelow || tooltipTop < 10) {
        tooltipTop = targetBottomZoomed + 8; // display below instead
        isBelow = true;
      }

      // 6. Collision check: Left/Right edge viewport/pane boundaries
      const padding = 12; // margin safety padding
      let minLeft = padding;
      let maxRight = (window.innerWidth / zoom) - padding;

      if (configPane) {
        const paneRect = configPane.getBoundingClientRect();
        const paneLeftZoomed = paneRect.left / zoom;
        const paneRightZoomed = paneRect.right / zoom;
        minLeft = paneLeftZoomed + padding;
        maxRight = paneRightZoomed - padding;
      }

      if (tooltipLeft + tooltipWidth > maxRight) {
        tooltipLeft = maxRight - tooltipWidth;
      }
      if (tooltipLeft < minLeft) {
        tooltipLeft = minLeft;
      }

      // 7. Calculate pointer arrow position relative to the tooltip box
      let arrowLeft = targetCenterZoomed - tooltipLeft;
      const minArrowPadding = 16;
      if (arrowLeft < minArrowPadding) arrowLeft = minArrowPadding;
      if (arrowLeft > tooltipWidth - minArrowPadding) arrowLeft = tooltipWidth - minArrowPadding;

      // 8. Apply calculated coordinates, transform origin and CSS variables
      tooltipEl.style.setProperty('--arrow-left', arrowLeft + 'px');
      tooltipEl.style.left = tooltipLeft + 'px';
      tooltipEl.style.top = tooltipTop + 'px';
      tooltipEl.style.transformOrigin = isBelow ? `${arrowLeft}px top` : `${arrowLeft}px bottom`;

      // Restore transitions and show
      tooltipEl.style.transition = '';
      tooltipEl.style.visibility = '';
      if (isBelow) {
        tooltipEl.classList.add('tooltip-below');
      }
      tooltipEl.classList.add('visible');
    });

    document.addEventListener('mouseout', e => {
      const target = e.target.closest('.has-tooltip');
      if (!target || !e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.has-tooltip')) {
        activeTooltipTarget = null;
        tooltipEl.classList.remove('visible');
      }
    });

    // Adaptive polling of game status:
    // - Fast while running (for quick UI lock/unlock)
    // - Slow while not running (reduce background load)
    const pollGameStatus = () => {
      fetch('/api/game-status')
        .then(res => res.json())
        .then(data => {
          const wasRunning = this.isGameRunning;
          this.isGameRunning = data.running;

          // If the game has just exited, automatically re-fetch mods to catch any in-game changes!
          if (wasRunning && !data.running) {
            this.notify('Factorio closed. Synchronizing mod profile states...');
            this.fetchMods();
          }
        })
        .catch(() => { })
        .finally(() => {
          const delay = this.isGameRunning ? 2000 : 10000;
          setTimeout(pollGameStatus, delay);
        });
    };
    pollGameStatus();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  new Vue(vueAppOptions);
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { vueAppOptions, sfx };
}
