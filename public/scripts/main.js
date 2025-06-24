document.addEventListener('DOMContentLoaded', () => {
  new Vue({
    el: '#app',
    data: {
      mods: [],
      status: ''
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
      }
    },
    mounted() {
      this.fetchMods();
    }
  });
});
