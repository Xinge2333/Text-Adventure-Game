const tabs = [
  { pagePath: '/pages/story/index', text: '故事' },
  { pagePath: '/pages/catalog/index', text: '主题' },
  { pagePath: '/pages/favorites/index', text: '我的' }
];

Component({
  data: {
    tabs,
    selected: 0,
    nightMode: false
  },

  lifetimes: {
    attached() {
      this.registerNightModeListener();
    },
    detached() {
      this.teardownNightModeListener();
    }
  },

  methods: {
    onTap(event) {
      const { index, path } = event.currentTarget.dataset;
      if (typeof index !== 'number') {
        return;
      }

      if (index === this.data.selected) {
        return;
      }

      this.setData({ selected: index });
      wx.switchTab({ url: path });
    },

    setSelected(index) {
      if (typeof index !== 'number' || index === this.data.selected) {
        return;
      }
      this.setData({ selected: index });
    },

    registerNightModeListener() {
      const app = getApp();
      if (typeof app?.onNightModeChange === 'function') {
        this.teardownNightModeListener();
        this._nightModeOff = app.onNightModeChange((flag) => {
          if (this.data.nightMode !== flag) {
            this.setData({ nightMode: flag });
          }
        });
      } else if (typeof app?.globalData?.nightMode === 'boolean') {
        this.setData({ nightMode: app.globalData.nightMode });
      }
    },

    teardownNightModeListener() {
      if (typeof this._nightModeOff === 'function') {
        this._nightModeOff();
        this._nightModeOff = null;
      }
    }
  }
});
