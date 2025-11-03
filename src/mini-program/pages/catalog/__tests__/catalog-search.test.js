const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const instantiatePage = (config) => {
  const instance = {
    data: JSON.parse(JSON.stringify(config.data)),
    setData(update) {
      Object.assign(this.data, update);
    }
  };
  Object.entries(config)
    .filter(([key]) => key !== 'data')
    .forEach(([key, value]) => {
      if (typeof value === 'function') {
        instance[key] = value.bind(instance);
      } else {
        instance[key] = value;
      }
    });
  return instance;
};

describe('Catalog page search and favorites', () => {
  let pageConfig;
  const requestQueue = [];

  const enqueueResponse = (method, url, statusCode, data) => {
    requestQueue.push({ method, url, statusCode, data });
  };

  const loadPage = () => {
    jest.isolateModules(() => {
      require('../index.js');
    });
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    pageConfig = null;
    requestQueue.length = 0;

    global.wx.request.mockImplementation(({ url, method = 'GET', success, fail }) => {
      const next = requestQueue.shift();
      if (!next) {
        fail?.(new Error(`No mock for ${method} ${url}`));
        return;
      }
      expect({ method, url }).toEqual({ method: next.method, url: next.url });
      success({ statusCode: next.statusCode, data: next.data });
    });

    global.wx.showToast.mockClear();
    global.wx.setStorageSync.mockClear();
    global.wx.switchTab.mockClear();
    global.wx.getStorageSync.mockReturnValue([]);

    global.Page = (config) => {
      pageConfig = config;
    };

    loadPage();
  });

  afterEach(() => {
    delete global.Page;
    global.wx.request.mockReset();
  });

  it('loads themes on initialize and updates search results', async () => {
    enqueueResponse('GET', '/themes', 200, {
      catalogVersion: 'demo-1',
      themes: [
        {
          themeId: 'school-revenge',
          title: '开学复仇',
          description: '复仇故事',
          tags: ['校园'],
          isFavorite: false
        }
      ]
    });
    enqueueResponse('GET', '/recommendations?limit=4', 200, { items: [] });

    enqueueResponse('GET', '/themes?q=%E4%BE%A6%E6%8E%A2', 200, {
      catalogVersion: 'demo-1',
      themes: []
    });

    const page = instantiatePage(pageConfig);
    page.startPolling = jest.fn();

    page.onLoad();
    await flushPromises();

    expect(page.data.themes).toHaveLength(1);
    expect(page.data.themes[0].title).toBe('开学复仇');

    await page.onSearchInput({ detail: { value: '侦探' } });
    await flushPromises();

    expect(page.data.query).toBe('侦探');
    expect(page.data.themes).toHaveLength(0);
  });

  it('toggles favorites and persists to storage', async () => {
    enqueueResponse('GET', '/themes', 200, {
      catalogVersion: 'demo-1',
      themes: [
        {
          themeId: 'school-revenge',
          title: '开学复仇',
          description: '复仇故事',
          tags: ['校园'],
          isFavorite: false
        }
      ]
    });
    enqueueResponse('GET', '/recommendations?limit=4', 200, { items: [] });

    const page = instantiatePage(pageConfig);
    page.startPolling = jest.fn();

    page.onLoad();
    await flushPromises();

    await page.onToggleFavorite({ currentTarget: { dataset: { id: 'school-revenge' } } });

    expect(global.wx.setStorageSync).toHaveBeenCalledWith('favorites', [
      {
        themeId: 'school-revenge',
        title: '开学复仇',
        description: '复仇故事'
      }
    ]);
    expect(page.data.themes[0].isFavorite).toBe(true);
  });

  it('sets pending theme and switches to story tab when selecting', () => {
    const page = instantiatePage(pageConfig);
    getApp().globalData.pendingThemeId = '';

    page.onSelectTheme({ currentTarget: { dataset: { id: 'school-revenge' } } });

    expect(getApp().globalData.pendingThemeId).toBe('school-revenge');
    expect(global.wx.switchTab).toHaveBeenCalledWith({ url: '/pages/story/index' });
  });
});
