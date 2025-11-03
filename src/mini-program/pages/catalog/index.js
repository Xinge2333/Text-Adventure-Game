import { api } from '../../utils/api';
import { storage } from '../../utils/storage';

Page({
  pollTimer: null,
  nightModeUnsubscribe: null,
  data: {
    query: '',
    themes: [],
    favorites: [],
    catalogVersion: '',
    isLoading: false,
    recommendations: [],
    isRecLoading: false,
    recError: '',
    lastRecRefreshedAt: '',
    nightMode: false
  },

  onLoad() {
    this.registerNightModeListener();
    this.initialize();
    void this.loadRecommendations();
  },

  onShow() {
    this.setTabBarIndex(1);
    // Refresh favorites when returning from favorites tab
    const favorites = this.resolveFavorites();
    this.setData({ favorites });
    this.updateThemeFavoriteState();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
    this.teardownNightModeListener();
  },

  async initialize() {
    const favorites = this.resolveFavorites();
    this.setData({ favorites });
    await this.fetchThemes();
    this.startPolling();
  },

  async loadRecommendations(forceToast = false) {
    this.setData({ isRecLoading: true, recError: '' });
    try {
      const response = await api.getRecommendations({ limit: 4 });
      const items = Array.isArray(response?.items) ? response.items : [];
      const recSetId = response?.recSetId || '';
      const normalized = items.map((item) => ({
        themeId: item.themeId,
        title: item.title,
        description: item.description,
        reason: item.reason || '猜你喜欢',
        recSetId,
        position: item.position ?? 0
      }));
      this.setData({
        recommendations: normalized,
        isRecLoading: false,
        lastRecRefreshedAt: new Date().toISOString()
      });
      if (forceToast) {
        wx.showToast({ title: '推荐已刷新', icon: 'success', duration: 800 });
      }
    } catch (error) {
      console.warn('Failed to load recommendations', error);
      this.setData({ isRecLoading: false, recError: '加载失败' });
      if (forceToast) {
        wx.showToast({ title: '推荐加载失败', icon: 'none' });
      }
    }
  },

  resolveFavorites() {
    const app = getApp();
    if (app?.globalData?.userProfile) {
      const serverFavorites = app.globalData.userProfile.favorites || [];
      storage.setFavorites(serverFavorites);
      return serverFavorites;
    }
    return storage.getFavorites();
  },

  async fetchThemes() {
    this.setData({ isLoading: true });
    try {
      const favorites = this.data.favorites.map((fav) => fav.themeId).join(',');
      const response = await api.listThemes({
        q: this.data.query,
        favorites
      });

      const themes = response.themes.map((theme) => ({
        ...theme,
        isFavorite: theme.isFavorite || this.data.favorites.some((fav) => fav.themeId === theme.themeId)
      }));

      this.setData({
        catalogVersion: response.catalogVersion,
        themes,
        isLoading: false
      });
    } catch (error) {
      console.warn('Failed to fetch themes', error);
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载主题失败', icon: 'none' });
    }
  },

  async checkCatalogVersion() {
    try {
      const favorites = this.data.favorites.map((fav) => fav.themeId).join(',');
      const response = await api.listThemes(
        {
          clientVersion: this.data.catalogVersion,
          favorites
        },
        { acceptNotModified: true }
      );

      if (response && response.notModified) {
        return;
      }

      if (response) {
        const themes = response.themes.map((theme) => ({
          ...theme,
          isFavorite: this.data.favorites.some((fav) => fav.themeId === theme.themeId)
        }));
        this.setData({
          catalogVersion: response.catalogVersion,
          themes
        });
        wx.showToast({ title: '已加载新主题', icon: 'success' });
      }
    } catch (error) {
      console.warn('Catalog version check failed', error);
    }
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.checkCatalogVersion();
    }, 60 * 1000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  onSearchInput(event) {
    this.setData({ query: event.detail.value });
    void this.fetchThemes();
  },

  onClearSearch() {
    this.setData({ query: '' });
    void this.fetchThemes();
  },

  onSelectTheme(event) {
    const { id } = event.currentTarget.dataset;
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingThemeId = id;
    }
    wx.switchTab({ url: '/pages/story/index' });
  },

  onSelectRecommendation(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingThemeId = id;
    }
    wx.switchTab({ url: '/pages/story/index' });
  },

  onRefreshRecommendations() {
    void this.loadRecommendations(true);
  },

  onToggleFavorite(event) {
    const { id } = event.currentTarget.dataset;
    const theme = this.data.themes.find((item) => item.themeId === id);
    if (!theme) return;

    const favorites = [...this.data.favorites];
    const existingIndex = favorites.findIndex((fav) => fav.themeId === id);

    if (existingIndex >= 0) {
      favorites.splice(existingIndex, 1);
    } else {
      favorites.push({
        themeId: theme.themeId,
        title: theme.title,
        description: theme.description
      });
    }

    storage.setFavorites(favorites);
    this.setData({ favorites });
    this.updateThemeFavoriteState();
    void this.persistFavorites(favorites);
  },

  updateThemeFavoriteState() {
    const favoriteIds = new Set(this.data.favorites.map((fav) => fav.themeId));
    const themes = this.data.themes.map((theme) => ({
      ...theme,
      isFavorite: favoriteIds.has(theme.themeId)
    }));
    this.setData({ themes });
  },

  async persistFavorites(favorites) {
    const app = getApp();
    if (!app?.globalData?.sessionToken) {
      return;
    }
    try {
      await api.updateFavorites(favorites);
      if (!app.globalData.userProfile) {
        app.globalData.userProfile = { profile: {} };
      }
      app.globalData.userProfile.favorites = favorites;
    } catch (error) {
      console.warn('Failed to sync favorites', error);
    }
  },

  registerNightModeListener() {
    const app = getApp();
    if (typeof app?.onNightModeChange === 'function') {
      this.nightModeUnsubscribe = app.onNightModeChange((flag) => {
        this.applyNightMode(flag);
      });
    } else if (typeof app?.globalData?.nightMode === 'boolean') {
      this.applyNightMode(app.globalData.nightMode);
    }
  },

  teardownNightModeListener() {
    if (typeof this.nightModeUnsubscribe === 'function') {
      this.nightModeUnsubscribe();
      this.nightModeUnsubscribe = null;
    }
  },

  applyNightMode(flag) {
    const enabled = Boolean(flag);
    if (this.data.nightMode !== enabled) {
      this.setData({ nightMode: enabled });
    }
    try {
      wx.setNavigationBarColor({
        frontColor: enabled ? '#ffffff' : '#000000',
        backgroundColor: enabled ? '#1c1c1e' : '#ffffff',
        animation: { duration: 200, timingFunc: 'easeIn' }
      });
    } catch (error) {
      console.warn('setNavigationBarColor failed', error);
    }
  },

  setTabBarIndex(index) {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar && typeof tabBar.setSelected === 'function') {
        tabBar.setSelected(index);
      }
    }
  }
});
