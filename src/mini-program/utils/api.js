const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
const SESSION_TOKEN_KEY = 'session-token';

const getBaseUrl = () => {
  const app = getApp();
  return app?.globalData?.apiBaseUrl || '';
};

const getSessionToken = () => {
  const app = getApp();
  if (app?.globalData?.sessionToken) {
    return app.globalData.sessionToken;
  }
  try {
    return wx.getStorageSync(SESSION_TOKEN_KEY) || '';
  } catch (error) {
    console.warn('Failed to read session token', error);
    return '';
  }
};

const request = (options) => {
  const baseUrl = getBaseUrl();
  const {
    url,
    method = 'GET',
    data,
    header,
    acceptNotModified = false,
    timeout = DEFAULT_TIMEOUT_MS
  } = options;
  return new Promise((resolve, reject) => {
    const headers = { ...header };
    const sessionToken = getSessionToken();
    if (sessionToken) {
      headers['x-session-token'] = sessionToken;
    }
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: headers,
      timeout,
      success: (res) => {
        if (res.statusCode === 304 && acceptNotModified) {
          resolve({ notModified: true });
          return;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(`Request failed: ${res.statusCode}`));
        }
      },
      fail: reject
    });
  });
};

export const api = {
  login(payload) {
    return request({
      url: '/auth/login',
      method: 'POST',
      data: payload,
      timeout: DEFAULT_TIMEOUT_MS
    });
  },

  getProfile() {
    return request({ url: '/me', method: 'GET' });
  },

  updateFavorites(favorites) {
    return request({
      url: '/me/favorites',
      method: 'PUT',
      data: { favorites },
      timeout: DEFAULT_TIMEOUT_MS
    });
  },

  logout() {
    return request({
      url: '/auth/logout',
      method: 'POST'
    });
  },

  getRecommendations(params = {}) {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    const url = query ? `/recommendations?${query}` : '/recommendations';
    return request({ url });
  },

  reportSkip({ themeId, recSetId, position, reason, turnCount } = {}) {
    return request({
      url: '/recommendations/skip',
      method: 'POST',
      data: { themeId, recSetId, position, reason, turnCount }
    });
  },

  listThemes(params = {}, options = {}) {
    const queryString = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    const url = queryString ? `/themes?${queryString}` : '/themes';
    return request({ url, acceptNotModified: options.acceptNotModified });
  },

  startStory({ themeId, modelProvider }) {
    const payload = { themeId };
    if (modelProvider) {
      payload.modelProvider = modelProvider;
    }
    return request({
      url: '/stories',
      method: 'POST',
      data: payload,
      timeout: DEFAULT_TIMEOUT_MS
    });
  },

  advanceStory({ sessionId, selectedOption, modelProvider, customOptionText }) {
    const payload = { selectedOption };
    if (modelProvider) {
      payload.modelProvider = modelProvider;
    }
    if (customOptionText) {
      payload.customOptionText = customOptionText;
    }
    return request({
      url: `/stories/${sessionId}/turns`,
      method: 'POST',
      data: payload,
      timeout: DEFAULT_TIMEOUT_MS
    });
  }
};
