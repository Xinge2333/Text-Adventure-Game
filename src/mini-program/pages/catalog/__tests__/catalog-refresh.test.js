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

describe('Catalog page refresh logic', () => {
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

  it('returns early when catalog version is unchanged', async () => {
    const page = instantiatePage(pageConfig);
    page.data.catalogVersion = 'demo-1';

    enqueueResponse('GET', '/themes?clientVersion=demo-1', 304, {});

    await page.checkCatalogVersion();

    expect(page.data.catalogVersion).toBe('demo-1');
    expect(global.wx.showToast).not.toHaveBeenCalled();
  });

  it('updates catalog when new version is available', async () => {
    enqueueResponse('GET', '/themes', 200, {
      catalogVersion: 'demo-1',
      themes: []
    });
    enqueueResponse('GET', '/recommendations?limit=4', 200, { items: [] });

    enqueueResponse('GET', '/themes?clientVersion=demo-1', 200, {
      catalogVersion: 'demo-2',
      themes: [
        {
          themeId: 'new-theme',
          title: '新主题',
          description: '描述',
          tags: ['test'],
          isFavorite: false
        }
      ]
    });

    const page = instantiatePage(pageConfig);
    page.startPolling = jest.fn();

    page.onLoad();
    await flushPromises();

    expect(page.data.catalogVersion).toBe('demo-1');

    page.startPolling = pageConfig.startPolling.bind(page);

    await page.checkCatalogVersion();

    expect(page.data.catalogVersion).toBe('demo-2');
    expect(page.data.themes).toHaveLength(1);
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '已加载新主题', icon: 'success' });
  });
});
