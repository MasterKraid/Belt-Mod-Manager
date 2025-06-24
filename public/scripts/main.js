document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      status: '',
      profiles: [],
      selectedProfile: 'default',
      currentTab: 'manager'
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
      }
    },
    mounted() {
      this.loadProfiles();
    }
  });
});
