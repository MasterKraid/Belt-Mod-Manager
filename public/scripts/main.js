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

document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      installedMods: [],
      installedSort: 'name',
      installedSortOpen: false,
      expandedMods: [],
      profiles: [],
      selectedProfile: 'default',
      currentTab: 'profiles',
      editingProfile: null,
      renameInput: '',
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
      portalAuth: { authenticated: false, username: null },
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
      ]
    },
    computed: {
      filteredMods() {
        const query = this.searchQueryManager.toLowerCase().trim();
        let list = [...this.mods];
        if (query) {
          list = list.filter(m => 
            (m.title && m.title.toLowerCase().includes(query)) || 
            (m.name && m.name.toLowerCase().includes(query))
          );
        }

        // Sort dynamically: Core mods first, then enabled mods, then disabled mods
        const coreNames = ['base', 'elevated-rails', 'quality', 'space-age'];
        list.sort((a, b) => {
          const aCore = coreNames.indexOf(a.name);
          const bCore = coreNames.indexOf(b.name);
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;

          // Enabled mods first
          if (a.enabled && !b.enabled) return -1;
          if (!a.enabled && b.enabled) return 1;

          // Stable alphabetical secondary sort (optimized)
          const aTitle = a.title || a.name;
          const bTitle = b.title || b.name;
          return aTitle < bTitle ? -1 : (aTitle > bTitle ? 1 : 0);
        });

        return list;
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
          if (this.installedSort === 'last-downloaded') {
            const aCore = coreNames.indexOf(a.name);
            const bCore = coreNames.indexOf(b.name);
            if (aCore !== -1 && bCore !== -1) return aCore - bCore; // keep relative core hierarchy
            if (aCore !== -1) return 1; // push core mods to the end!
            if (bCore !== -1) return -1; // push core mods to the end!

            const am = a.mtime || 0;
            const bm = b.mtime || 0;
            if (am !== bm) {
              return bm - am; // newest first!
            }
          } else {
            const aCore = coreNames.indexOf(a.name);
            const bCore = coreNames.indexOf(b.name);
            if (aCore !== -1 && bCore !== -1) return aCore - bCore;
            if (aCore !== -1) return -1; // core mods at the top!
            if (bCore !== -1) return 1; // core mods at the top!
          }

          const aTitle = a.title || a.name;
          const bTitle = b.title || b.name;
          return aTitle < bTitle ? -1 : (aTitle > bTitle ? 1 : 0);
        });
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
    methods: {
      playSound(name) {
        if (sfx[name]) {
          sfx[name].currentTime = 0;
          sfx[name].play().catch(() => {});
        }
      },
      switchTab(tab) {
        if (this.currentTab !== tab) {
          this.currentTab = tab;
          this.playSound('tabSwitch');
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
          return {
            name: cleanName,
            required: false,
            incompatible: isIncompatible,
            optional: isOptional
          };
        }
        const parts = s.split(/\s+/);
        const name = parts[0];
        return {
          name: name,
          required: true,
          incompatible: false,
          optional: false
        };
      },
      enableDependenciesOf(mod) {
        const installed = this.installedMods.find(m => m.name === mod.name);
        if (!installed || !installed.dependencies) return;

        installed.dependencies.forEach(depStr => {
          const parsed = this.parseDependency(depStr);
          if (parsed && parsed.required) {
            const depMod = this.mods.find(m => m.name === parsed.name);
            if (depMod && !depMod.enabled) {
              depMod.enabled = true;
              this.notify(`Enabled required dependency: ${depMod.title || depMod.name}`);
              this.enableDependenciesOf(depMod);
            }
          }
        });
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
      notify(message, duration = 5) {
        const id = ++this.notifId;
        this.notifications.push({ id, message, duration });
        setTimeout(() => {
          this.notifications = this.notifications.filter(n => n.id !== id);
        }, duration * 1000);
      },
      minimizeWindow() {
        this.playSound('click');
        if (window.electronAPI && window.electronAPI.minimizeWindow) {
          window.electronAPI.minimizeWindow();
        }
      },
      maximizeWindow() {
        this.playSound('click');
        if (window.electronAPI && window.electronAPI.maximizeWindow) {
          window.electronAPI.maximizeWindow();
        }
      },
      closeWindow() {
        this.playSound('exit');
        setTimeout(() => {
          if (window.electronAPI && window.electronAPI.closeWindow) {
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
          });
      },

      saveMods() {
        this.playSound('click');
        fetch(`/api/profiles/${this.selectedProfile}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => {
          this.notify('Mods saved!');
        });
      },
      autoSaveMods() {
        // Silently auto-save mod toggle updates to the active profile on change
        fetch(`/api/profiles/${this.selectedProfile}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
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
        if (profileName.startsWith('___new_profile_')) return;
        this.playSound('sliderOn');
        this.selectedProfile = profileName;
        fetch(`/api/switch/${profileName}`, { method: 'POST' })
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
          this.selectedProfile = newName;
          this.editingProfile = null;
          this.renameInput = '';
          this.loadProfiles();
          if (oldName.startsWith('___new_profile_')) {
            this.activateProfile(newName);
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
              window.electronAPI.openExternal(data.openUrl);
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
        fetch('/api/portal/downloads')
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
          .catch(() => {});
      },

      cancelDownload(id) {
        this.playSound('click');
        fetch(`/api/portal/download-cancel/${id}`, { method: 'POST' })
          .then(() => this.pollDownloads())
          .catch(() => {});
      },

      clearDownloads() {
        this.playSound('click');
        fetch('/api/portal/downloads-clear', { method: 'POST' })
          .then(() => {
            this.activeDownloads = [];
            this.stopDownloadPolling();
          })
          .catch(() => {});
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
          .catch(() => {});
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
      }
    },
    mounted() {
      this.loadProfiles();
      fetch('/api/get-mod-path')
        .then(res => res.json())
        .then(data => this.currentModPath = data.path);
      fetch('/api/get-game-path')
        .then(res => res.json())
        .then(data => this.gamePath = data.path);
      // Defer mod scanning fetch to allow initial paint to happen first.
      requestAnimationFrame(() => this.fetchInstalledMods());
      this.fetchAuthStatus();
      this.portalSearch(1, true);

      // Dismiss the custom dropdown on click-away
      document.addEventListener('click', () => {
        this.dropdownOpen = false;
        this.closeDlDropdowns();
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

        tooltipEl.textContent = text;
        
        // 1. Reset classes and transitions to measure size accurately
        tooltipEl.className = '';
        tooltipEl.style.transition = 'none';
        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block';

        // 2. Measure tooltip real size
        const tooltipWidth = tooltipEl.offsetWidth;
        const tooltipHeight = tooltipEl.offsetHeight;

        // 3. Measure target element position
        const targetRect = target.getBoundingClientRect();
        const targetCenter = targetRect.left + (targetRect.width / 2);

        // 4. Calculate coordinates relative to viewport
        let tooltipLeft = targetCenter - (tooltipWidth / 2);
        let tooltipTop = targetRect.top - tooltipHeight - 8; // 8px space above
        let isBelow = false;

        // 5. Force below if target has tooltip-below class or data-tooltip-position="below"
        const forceBelow = target.classList.contains('tooltip-below') || target.getAttribute('data-tooltip-position') === 'below';
        if (forceBelow || tooltipTop < 10) {
          tooltipTop = targetRect.bottom + 8; // display below instead
          isBelow = true;
        }

        // 6. Collision check: Left/Right edge viewport boundaries
        const padding = 12; // margin safety padding from window edge
        if (tooltipLeft + tooltipWidth > window.innerWidth - padding) {
          tooltipLeft = window.innerWidth - padding - tooltipWidth;
        }
        if (tooltipLeft < padding) {
          tooltipLeft = padding;
        }

        // 7. Calculate pointer arrow position relative to the tooltip box
        let arrowLeft = targetCenter - tooltipLeft;
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
          .catch(() => {})
          .finally(() => {
            const delay = this.isGameRunning ? 2000 : 10000;
            setTimeout(pollGameStatus, delay);
          });
      };
      pollGameStatus();
    }
  });
});
