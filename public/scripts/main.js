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
      // Downloader tab
      portalQuery: '',
      portalResults: [],
      portalPagination: { page: 1, pageCount: 1, count: 0 },
      portalSort: 'updated_at',
      portalCategory: '',
      portalLoading: false,
      portalSearched: false,
      activeDownloads: [],
      includeOptionalDeps: false,
      downloadPollTimer: null,
      dlSortOpen: false,
      dlCategoryOpen: false,
      showAuthPopup: false,
      portalAuth: { authenticated: false, username: null },
      authUsername: '',
      authToken: '',
      portalCategories: [
        { value: '', label: 'All Categories' },
        { value: 'content', label: 'Content' },
        { value: 'overhaul', label: 'Overhaul' },
        { value: 'tweaks', label: 'Tweaks' },
        { value: 'utilities', label: 'Utilities' },
        { value: 'scenarios', label: 'Scenarios' },
        { value: 'mod-packs', label: 'Mod Packs' },
        { value: 'localizations', label: 'Localizations' },
        { value: 'internal', label: 'Internal' }
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
          const aCore = coreNames.indexOf(a.name);
          const bCore = coreNames.indexOf(b.name);
          if (aCore !== -1 && bCore !== -1) return aCore - bCore;
          if (aCore !== -1) return -1;
          if (bCore !== -1) return 1;

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
        const labels = { updated_at: 'Recently Updated', name: 'Name (A-Z)', created_at: 'Newest' };
        return labels[this.portalSort] || 'Sort';
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
        } else {
          this.playSound('sliderOff');
        }
        this.autoSaveMods();
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
      portalSearch(page) {
        if (this.portalLoading) return;
        this.playSound('click');
        this.portalLoading = true;
        this.portalSearched = true;
        const q = this.portalQuery.trim();
        const params = new URLSearchParams({
          q: q,
          page: page || 1,
          page_size: 15,
          sort: this.portalSort,
          sort_order: this.portalSort === 'name' ? 'asc' : 'desc'
        });
        if (this.portalCategory) params.set('category', this.portalCategory);
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
            mod.installed = true;
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
        this.pollDownloads();
        this.downloadPollTimer = setInterval(() => this.pollDownloads(), 600);
      },

      stopDownloadPolling() {
        if (this.downloadPollTimer) {
          clearInterval(this.downloadPollTimer);
          this.downloadPollTimer = null;
        }
      },

      pollDownloads() {
        fetch('/api/portal/downloads')
          .then(res => res.json())
          .then(data => {
            this.activeDownloads = data || [];
            const hasActive = data.some(d => ['downloading', 'queued', 'retrying'].includes(d.status));
            if (!hasActive && this.downloadPollTimer) {
              // All done — do a final poll after a brief delay, then stop
              setTimeout(() => {
                this.stopDownloadPolling();
                this.fetchMods();
                this.fetchInstalledMods();
              }, 1000);
            }
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
        if (!this.authUsername || !this.authToken) return;
        this.playSound('click');
        fetch('/api/portal/auth-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.authUsername, token: this.authToken })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              this.notify('Credentials saved and encrypted.');
              this.portalAuth = { authenticated: true, username: data.username };
              this.authUsername = '';
              this.authToken = '';
              this.showAuthPopup = false;
            } else {
              this.notify('Error: ' + (data.error || 'Unknown'));
            }
          })
          .catch(err => this.notify('Save failed: ' + err.message));
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
      this.fetchInstalledMods();
      this.fetchAuthStatus();

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

      // Poll game running status every 2 seconds
      setInterval(() => {
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
          .catch(() => {});
      }, 2000);
    }
  });
});
