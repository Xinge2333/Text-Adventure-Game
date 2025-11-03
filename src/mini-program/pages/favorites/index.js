import { storage } from '../../utils/storage';

const NIGHT_MODE_KEY = 'night-mode';
const MODEL_KEY = 'preferred-model';

Page({
  nightModeUnsubscribe: null,

  onLoad() {
    this.registerNightModeListener();
  },

  data: {
    favorites: [],
    favoritesPreview: [],
    showProfileModal: false,
    showFavoritesModal: false,
    showSettingsModal: false,
    nightMode: false,
    selectedModel: 'qwen',
    userDisplayName: '未登录用户',
    userSubtitle: '登录后可同步收藏与设置',
    userAvatar: '',
    userInitial: '🙂',
    modelOptions: [
      { id: 'deepseek', label: '1号' },
      { id: 'qwen', label: '2号' }
    ],
    isLoggingIn: false,
    isLoggedIn: false
  },

  onShow() {
    this.setTabBarIndex(2);
    this.loadFavorites();
    this.loadPreferences();
    this.updateUserDisplay();
    const app = getApp();
    if (app?.onAuthReady) {
      app.onAuthReady((profile) => {
        this.updateUserDisplay(profile);
        this.loadFavorites();
      });
    }
  },

  onUnload() {
    this.teardownNightModeListener();
  },

  loadFavorites() {
    const favorites = this.resolveFavorites();
    this.setData({
      favorites,
      favoritesPreview: favorites.slice(0, 2)
    });
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

  loadPreferences() {
    try {
      const storedNightMode = wx.getStorageSync(NIGHT_MODE_KEY);
      const selectedModel = wx.getStorageSync(MODEL_KEY);
      const app = getApp();
      const resolvedNightMode =
        typeof storedNightMode === 'boolean'
          ? storedNightMode
          : typeof app?.globalData?.nightMode === 'boolean'
            ? app.globalData.nightMode
            : this.data.nightMode;
      this.setData({
        selectedModel: selectedModel || this.data.selectedModel
      });
      this.applyNightMode(resolvedNightMode);
      if (app?.setNightMode) {
        app.setNightMode(resolvedNightMode);
      }
    } catch (error) {
      console.warn('Failed to read preferences', error);
    }
  },

  updateUserDisplay(profile) {
    const app = getApp();
    const activeProfile = profile || app?.globalData?.userProfile;
    const hasProfile = Boolean(activeProfile);
    const nickName = activeProfile?.profile?.nickName?.trim();
    const displayName = nickName || (hasProfile ? '已登录用户' : '未登录用户');
    const subtitle = hasProfile ? '云端同步已开启' : '登录后可同步收藏与设置';
    const avatar = activeProfile?.profile?.avatarUrl || '';
    const fallbackInitial = displayName?.trim()
      ? displayName.trim().charAt(0).toUpperCase()
      : '🙂';
    this.setData({
      userDisplayName: displayName,
      userSubtitle: subtitle,
      userAvatar: avatar,
      userInitial: fallbackInitial,
      isLoggedIn: Boolean(activeProfile)
    });
  },

  openProfileModal() {
    this.setData({ showProfileModal: true });
    if (!this.data.isLoggedIn) {
      void this.onRequestLogin();
    }
  },

  async onRequestLogin() {
    if (this.data.isLoggingIn) {
      return;
    }
    const app = getApp();
    if (typeof app?.bootstrapAuth !== 'function') {
      wx.showToast({ title: '暂不支持登录', icon: 'none' });
      return;
    }
    this.setData({ isLoggingIn: true });
    wx.showLoading({ title: '正在登录…', mask: true });
    let profile = null;
    try {
      profile = await this.requestUserProfile();
    } catch (error) {
      console.warn('profile permission denied', error);
    }
    try {
      await app.bootstrapAuth({ force: true, profile });
      if (app?.globalData?.userProfile) {
        this.updateUserDisplay(app.globalData.userProfile);
        this.loadFavorites();
        wx.showToast({ title: '登录成功', icon: 'success', duration: 800 });
      } else {
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    } catch (error) {
      console.warn('manual login failed', error);
      wx.showToast({ title: '登录失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isLoggingIn: false });
    }
  },

  requestUserProfile() {
    return new Promise((resolve, reject) => {
      const handleSuccess = (res = {}) => {
        const info = res.userInfo || {};
        if (!info.nickName && !info.avatarUrl) {
          resolve(null);
          return;
        }
        resolve({ nickName: info.nickName, avatarUrl: info.avatarUrl });
      };
      if (typeof wx.getUserProfile === 'function') {
        wx.getUserProfile({
          desc: '用于展示头像与昵称',
          success: handleSuccess,
          fail: reject
        });
        return;
      }
      if (typeof wx.getUserInfo === 'function') {
        wx.getUserInfo({ success: handleSuccess, fail: reject });
        return;
      }
      resolve(null);
    });
  },

  openFavoritesModal() {
    this.loadFavorites();
    this.setData({ showFavoritesModal: true });
  },

  openSettingsModal() {
    this.setData({ showSettingsModal: true });
  },

  closeModals() {
    this.setData({
      showProfileModal: false,
      showFavoritesModal: false,
      showSettingsModal: false
    });
  },

  onSelectFavorite(event) {
    const { id } = event.currentTarget.dataset;
    this.closeModals();
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingThemeId = id;
    }
    wx.switchTab({ url: '/pages/story/index' });
  },

  onNightModeChange(event) {
    const nightMode = event.detail.value;
    this.applyNightMode(nightMode);
    try {
      wx.setStorageSync(NIGHT_MODE_KEY, nightMode);
    } catch (error) {
      console.warn('Failed to persist night mode', error);
    }
    const app = getApp();
    if (app?.setNightMode) {
      app.setNightMode(nightMode);
    }
    wx.showToast({ title: nightMode ? '夜间模式已开启' : '夜间模式已关闭', icon: 'none' });
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

  onModelChange(event) {
    const { value } = event.detail;
    this.setData({ selectedModel: value });
    try {
      wx.setStorageSync(MODEL_KEY, value);
    } catch (error) {
      console.warn('Failed to persist model selection', error);
    }
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.preferredModel = value;
    }
    wx.showToast({ title: `已切换为 ${value === 'qwen' ? '2号' : '1号'}`, icon: 'none' });
  },

  async onLogout() {
    const app = getApp();
    if (!app?.logoutUser) {
      return;
    }
    wx.showToast({ title: '正在退出…', icon: 'loading', duration: 800 });
    await app.logoutUser({ relogin: false });
    this.updateUserDisplay(null);
    this.loadFavorites();
    wx.showToast({ title: '已退出登录', icon: 'none' });
  },

  noop() {},

  setTabBarIndex(index) {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar && typeof tabBar.setSelected === 'function') {
        tabBar.setSelected(index);
      }
    }
  }
});
