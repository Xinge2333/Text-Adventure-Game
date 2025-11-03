const storageStore = new Map();

global.wx = {
  request: jest.fn(),
  showToast: jest.fn(),
  navigateTo: jest.fn(),
  switchTab: jest.fn(),
  getStorageSync: jest.fn((key) => storageStore.get(key)),
  setStorageSync: jest.fn((key, value) => {
    storageStore.set(key, value);
  }),
  removeStorageSync: jest.fn((key) => {
    storageStore.delete(key);
  }),
  pageScrollTo: jest.fn(),
  login: jest.fn((options = {}) => {
    if (options.success) {
      options.success({ code: 'test-code' });
    }
  })
};

const mockApp = {
  globalData: {
    apiBaseUrl: '',
    telemetryEnabled: true,
    pendingThemeId: '',
    preferredModel: 'qwen'
  }
};

global.getApp = () => mockApp;

beforeEach(() => {
  mockApp.globalData.pendingThemeId = '';
  storageStore.clear();
});
