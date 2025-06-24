document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      status: '',
      modPathInput: '',
    },
    methods: {
      fetchMods() {
        fetch('/api/mods')
          .then(res => res.json())
          .then(data => {
            this.mods = data;
          });
      },
      saveMods() {
        fetch('/api/mods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mods)
        }).then(() => this.status = 'Saved!');
      },
      toggleAll(enable) {
        this.mods.forEach(m => m.enabled = enable);
      },
      setModPath() {
        fetch('/api/set-mod-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: this.modPathInput })
        }).then(res => {
          if (res.ok) {
            this.status = 'Mod path set!';
            this.fetchMods();
          } else {
            this.status = 'Invalid path';
          }
        });
      }
    },
    mounted() {
      this.fetchMods();
    }
  });
});
