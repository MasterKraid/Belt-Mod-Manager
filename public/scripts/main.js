document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      status: '',
      profiles: [],
      selectedProfile: 'default',
      currentTab: 'manager',
      editingProfile: null,
      renameInput: '',
      currentModPath: ''
    },
    methods: {
      fetchMods() {
        fetch(`/api/profiles/${this.selectedProfile}`)
          .then(res => res.json())
          .then(data => this.mods = data);
      },
      saveMods() {
        fetch(`/api/profiles/${this.selectedProfile}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => this.status = 'Saved!');
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
        const name = prompt("New profile name:");
        if (!name) return;
        fetch(`/api/profiles/${name}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => {
          this.selectedProfile = name;
          this.loadProfiles();
        });
      },
      activateProfile(profileName) {
        if (profileName === this.selectedProfile) return;
        this.selectedProfile = profileName;
        fetch(`/api/switch/${profileName}`, { method: 'POST' })
          .then(() => {
            this.status = `Switched to ${profileName}`;
            this.fetchMods();
          });
      },
      // --- Renaming profiles ---
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
      triggerPathPicker() {
        document.getElementById('dir-picker').click();
      },
      setModPath(evt) {
        const folder = evt.target.files?.[0];
        if (!folder || !folder.path) return;
        const path = folder.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
        fetch('/api/set-mod-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        }).then(() => {
          this.currentModPath = path;
          this.status = 'Mod path updated';
          this.fetchMods();
        });
      }
    },
    mounted() {
      this.loadProfiles();
      fetch('/api/get-mod-path')
        .then(res => res.json())
        .then(data => this.currentModPath = data.path);

    }
  });
});
