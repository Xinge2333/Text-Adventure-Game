import { api } from './utils/api';
import { storage } from './utils/storage';

const MODEL_KEY = 'preferred-model';
const SESSION_TOKEN_KEY = 'session-token';
const NIGHT_MODE_KEY = 'night-mode';

App({
  authListeners: [],
  nightModeListeners: [],
  _authPromise: null,

  onLaunch() {
    this.restoreModelPreference();
    this.restoreNightModePreference();
    this.globalData.sessionToken = this.readSessionToken();
    this.globalData.userProfile = null;
    void this.bootstrapAuth();
  },

  restoreModelPreference() {
    try {
      const storedModel = wx.getStorageSync(MODEL_KEY);
      if (typeof storedModel === 'string' && storedModel) {
        this.globalData.preferredModel = storedModel;
      }
    } catch (error) {
      console.warn('Failed to read preferred model', error);
    }
  },

  restoreNightModePreference() {
    try {
      const storedFlag = wx.getStorageSync(NIGHT_MODE_KEY);
      if (typeof storedFlag === 'boolean') {
        this.globalData.nightMode = storedFlag;
      }
    } catch (error) {
      console.warn('Failed to read night mode', error);
    }
  },

  readSessionToken() {
    try {
      return wx.getStorageSync(SESSION_TOKEN_KEY) || '';
    } catch (error) {
      console.warn('Failed to restore session token', error);
      return '';
    }
  },

  async bootstrapAuth(options = {}) {
    const { force = false, profile } = options;
    if (this._authPromise && !force) {
      return this._authPromise;
    }
    this._authPromise = (async () => {
      try {
        const code = await this.requestLoginCode();
        if (!code) {
          return;
        }
        const payload = { code };
        if (profile?.nickName) {
          payload.nickName = profile.nickName;
        }
        if (profile?.avatarUrl) {
          payload.avatarUrl = profile.avatarUrl;
        }
        const response = await api.login(payload);
        if (!response || !response.sessionToken) {
          return;
        }
        this.globalData.sessionToken = response.sessionToken;
        try {
          wx.setStorageSync(SESSION_TOKEN_KEY, response.sessionToken);
        } catch (error) {
          console.warn('Failed to persist session token', error);
        }
        this.globalData.userProfile = response.user || null;
        if (Array.isArray(response?.user?.favorites)) {
          storage.setFavorites(response.user.favorites);
        }
        this.notifyAuthReady(response.user);
      } catch (error) {
        console.warn('bootstrapAuth failed', error);
      }
    })();
    try {
      await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  },

  requestLoginCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        timeout: 10000,
        success: (res) => {
          if (res.code) {
            resolve(res.code);
            return;
          }
          reject(new Error('Missing wx.login code'));
        },
        fail: reject
      });
    });
  },

  notifyAuthReady(user) {
    if (!this.authListeners?.length) {
      return;
    }
    this.authListeners.forEach((listener) => {
      try {
        listener?.(user);
      } catch (error) {
        console.warn('auth listener failed', error);
      }
    });
    this.authListeners = [];
  },

  onAuthReady(callback) {
    if (this.globalData.sessionToken && this.globalData.userProfile) {
      callback?.(this.globalData.userProfile);
      return;
    }
    this.authListeners = this.authListeners || [];
    this.authListeners.push(callback);
  },

  setNightMode(enabled) {
    const flag = Boolean(enabled);
    if (this.globalData.nightMode === flag) {
      return;
    }
    this.globalData.nightMode = flag;
    this.notifyNightModeChange(flag);
  },

  notifyNightModeChange(flag) {
    if (!Array.isArray(this.nightModeListeners)) {
      return;
    }
    this.nightModeListeners.forEach((listener) => {
      try {
        listener?.(flag);
      } catch (error) {
        console.warn('night mode listener failed', error);
      }
    });
  },

  onNightModeChange(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }
    this.nightModeListeners = this.nightModeListeners || [];
    this.nightModeListeners.push(callback);
    callback(this.globalData.nightMode ?? false);
    return () => {
      this.offNightModeChange(callback);
    };
  },

  offNightModeChange(callback) {
    if (!Array.isArray(this.nightModeListeners)) {
      return;
    }
    this.nightModeListeners = this.nightModeListeners.filter((listener) => listener !== callback);
  },

  clearSessionState() {
    this.globalData.sessionToken = '';
    this.globalData.userProfile = null;
    storage.setFavorites([]);
    try {
      wx.removeStorageSync(SESSION_TOKEN_KEY);
    } catch (error) {
      console.warn('Failed to remove session token', error);
    }
  },

  async logoutUser(options = { relogin: true }) {
    if (this.globalData.sessionToken) {
      try {
        await api.logout();
      } catch (error) {
        console.warn('logout request failed', error);
      }
    }
    this.clearSessionState();
    if (options?.relogin !== false) {
      void this.bootstrapAuth({ force: true });
    }
  },

  globalData: {
    apiBaseUrl: 'http://127.0.0.1:8080',
    telemetryEnabled: true,
    preferredModel: 'qwen',
    sessionToken: '',
    userProfile: null,
    nightMode: false
  }
});
