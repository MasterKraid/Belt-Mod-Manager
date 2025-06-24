document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      installedMods: [],
      profiles: [],
      selectedProfile: 'default',
      currentTab: 'profiles',
      editingProfile: null,
      renameInput: '',
      currentModPath: '',
      gamePath: '',
      notifications: [],
      notifId: 0
    },
    methods: {
      notify(message, duration = 5) {
        const id = ++this.notifId;
        this.notifications.push({ id, message, duration });
        setTimeout(() => {
          this.notifications = this.notifications.filter(n => n.id !== id);
        }, duration * 1000);
      },
      fetchMods() {
        fetch(`/api/profiles/${this.selectedProfile}`)
          .then(res => res.json())
          .then(data => this.mods = data);
      },
      fetchInstalledMods() {
        fetch('/api/installed-mods')
          .then(res => res.json())
          .then(data => this.installedMods = data);
      },

      saveMods() {
        fetch(`/api/profiles/${this.selectedProfile}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => {
          this.notify('Mods saved!');
        });
      },
      toggleAll(state) {
        this.mods.forEach(m => m.enabled = state);
      },
      loadProfiles() {
        fetch('/api/profiles')
          .then(res => res.json())
          .then(p => {
            this.profiles = p;
            if (!p.includes(this.selectedProfile)) {
              this.selectedProfile = p[0] || 'default';
            }
            this.fetchMods();
          });
      },
      createProfile() {
        const temp = '___new_profile_' + Date.now();
        this.profiles.push(temp);
        this.editingProfile = temp;
        this.renameInput = '';
      },
      activateProfile(profileName) {
        if (profileName === this.selectedProfile) return;
        this.selectedProfile = profileName;
        fetch(`/api/switch/${profileName}`, { method: 'POST' })
          .then(() => {
            this.fetchMods();
            this.notify(`Switched to ${profileName}`);
          });
      },
      startRename(profileName) {
        this.editingProfile = profileName;
        this.renameInput = profileName;
      },
      cancelRename() {
        this.editingProfile = null;
        this.renameInput = '';
      },
      submitRename(oldName) {
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
        });
      },
      setGamePath() {
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
      setModPath() {
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
      }
    },
    mounted() {
      this.loadProfiles();
      fetch('/api/get-mod-path')
        .then(res => res.json())
        .then(data => this.currentModPath = data.path);
      this.fetchInstalledMods();
    }
  });
});
