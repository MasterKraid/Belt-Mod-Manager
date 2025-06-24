document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      profiles: [],
      selectedProfile: '',
      mods: [],
      status: '',
    },
    methods: {
      fetchProfiles() {
        fetch('/api/profiles')
          .then(res => res.json())
          .then(data => {
            this.profiles = data;
            this.selectedProfile = data[0];
            this.loadProfile();
          });
      },
      loadProfile() {
        fetch(`/api/profiles/${this.selectedProfile}`)
          .then(res => res.json())
          .then(data => {
            this.mods = data;
          });
      },
      saveProfile() {
        fetch(`/api/profiles/${this.selectedProfile}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => this.status = 'Saved!');
      },
      switchProfile() {
        fetch(`/api/switch/${this.selectedProfile}`, { method: 'POST' })
          .then(() => this.status = `Switched to ${this.selectedProfile}`);
      },
      toggleAll(enable) {
        this.mods = this.mods.map(mod => ({ ...mod, enabled: enable }));
      },
      createProfile() {
        const name = prompt('Enter new profile name:');
        if (name) {
          fetch(`/api/profiles/${name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.mods)
          }).then(() => {
            this.fetchProfiles();
            this.selectedProfile = name;
          });
        }
      }
    },
    mounted() {
      this.fetchProfiles();
    }
  });
});