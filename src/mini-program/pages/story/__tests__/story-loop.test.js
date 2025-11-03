jest.mock('../../utils/telemetry', () => ({
  submitTurnTelemetry: jest.fn()
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setDeepValue = (target, path, value) => {
  const segments = path.replace(/\]/g, '').split(/[.\[]/).filter(Boolean);
  if (segments.length === 0) {
    return;
  }
  let current = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!(segment in current)) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
};

const instantiatePage = (config) => {
  const instance = {
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData(update) {
      if (!update || Object.keys(update).length === 0) {
        return;
      }
      Object.entries(update).forEach(([key, value]) => {
        if (!key.includes('[') && !key.includes('.')) {
          this.data[key] = value;
        } else {
          setDeepValue(this.data, key, value);
        }
      });
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

describe('Story page interactions', () => {
  let pageConfig;
  let submitTurnTelemetry;
  const requestQueue = [];

  const enqueueResponse = (method, url, statusCode, data) => {
    requestQueue.push({ method, url, statusCode, data });
  };

  const enqueueRecommendations = (items = []) => {
    enqueueResponse('GET', '/recommendations?limit=6', 200, { items });
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
    global.wx.pageScrollTo.mockClear();
    global.Page = (config) => {
      pageConfig = config;
    };

    loadPage();
    submitTurnTelemetry = jest.requireMock('../../utils/telemetry').submitTurnTelemetry;

    const app = getApp();
    if (app?.globalData) {
      delete app.globalData.storyThemes;
    }
  });

  afterEach(() => {
    delete global.Page;
    global.wx.request.mockReset();
  });

  const getActivePanel = (page) => page.data.themePanels[page.data.activeIndex];

  it('loads initial panel and advances story', async () => {
    enqueueRecommendations([
      { themeId: 'school-revenge', reason: '猜你喜欢' },
      { themeId: 'palace-survival', reason: '热门推荐' }
    ]);
    enqueueResponse('GET', '/themes', 200, {
      themes: [
        { themeId: 'school-revenge', title: '校园复仇' },
        { themeId: 'palace-survival', title: '宫廷生存' }
      ]
    });
    enqueueResponse('POST', '/stories', 200, {
      sessionId: 'session-1',
      narrative: '序章',
      options: ['A', 'B', 'C', 'D'],
      ending: false,
      turnIndex: 0
    });
    enqueueResponse('POST', '/stories/session-1/turns', 200, {
      sessionId: 'session-1',
      turnIndex: 1,
      narrative: '第二段',
      options: ['A1', 'B1', 'C1', 'D1'],
      ending: false,
      moderationMessage: ''
    });

    const page = instantiatePage(pageConfig);

    await page.onLoad({ themeId: 'school-revenge' });
    await flushPromises();

    const active = getActivePanel(page);
    expect(active.sessionId).toBe('session-1');
    expect(active.narrative).toBe('序章');
    expect(active.options).toHaveLength(4);
    expect(active.turnCount).toBe(1);

    await page.onPanelOption({ currentTarget: { dataset: { themeid: 'school-revenge', index: 1 } } });
    await flushPromises();

    const updated = getActivePanel(page);
    expect(updated.narrative).toBe('第二段');
    expect(updated.turnCount).toBe(2);
  });

  it('switching panels loads target theme and preserves independent state', async () => {
    enqueueRecommendations([
      { themeId: 'theme-1', reason: '猜你喜欢' },
      { themeId: 'theme-2', reason: '热门推荐' }
    ]);
    enqueueResponse('GET', '/themes', 200, {
      themes: [
        { themeId: 'theme-1', title: '主题一' },
        { themeId: 'theme-2', title: '主题二' }
      ]
    });
    enqueueResponse('POST', '/stories', 200, {
      sessionId: 'panel-1',
      narrative: '第一主题内容',
      options: ['一', '二'],
      ending: false,
      turnIndex: 0
    });
    enqueueResponse('POST', '/recommendations/skip', 202, { recorded: true });
    enqueueResponse('POST', '/stories', 200, {
      sessionId: 'panel-2',
      narrative: '第二主题开场',
      options: ['甲', '乙'],
      ending: false,
      turnIndex: 0
    });
    enqueueResponse('POST', '/recommendations/skip', 202, { recorded: true });

    const page = instantiatePage(pageConfig);
    await page.onLoad({ themeId: 'theme-1' });
    await flushPromises();

    const firstPanel = getActivePanel(page);
    expect(firstPanel.narrative).toBe('第一主题内容');

    page.switchPanel(1);
    await flushPromises();
    await sleep(350);

    const secondPanel = getActivePanel(page);
    expect(page.data.activeIndex).toBe(1);
    expect(secondPanel.narrative).toBe('第二主题开场');

    page.switchPanel(-1);
    await flushPromises();
    await sleep(350);

    const restoredFirst = getActivePanel(page);
    expect(restoredFirst.narrative).toBe('第一主题内容');
    expect(restoredFirst.sessionId).toBe('panel-1');
  });

  it('refreshing a panel keeps previous content until new story arrives', async () => {
    enqueueRecommendations([{ themeId: 'refresh-theme', reason: '猜你喜欢' }]);
    enqueueResponse('GET', '/themes', 200, {
      themes: [{ themeId: 'refresh-theme', title: '刷新主题' }]
    });
    enqueueResponse('POST', '/stories', 200, {
      sessionId: 'first-session',
      narrative: '初始剧情',
      options: ['1', '2'],
      ending: false,
      turnIndex: 0
    });
    enqueueResponse('POST', '/stories', 200, {
      sessionId: 'second-session',
      narrative: '刷新后剧情',
      options: ['3', '4'],
      ending: false,
      turnIndex: 0
    });

    const page = instantiatePage(pageConfig);
    await page.onLoad({ themeId: 'refresh-theme' });
    await flushPromises();

    const panelBefore = getActivePanel(page);
    expect(panelBefore.narrative).toBe('初始剧情');

    await page.onPanelRefresh({ currentTarget: { dataset: { themeid: 'refresh-theme' } } });
    await flushPromises();

    const panelAfter = getActivePanel(page);
    expect(panelAfter.narrative).toBe('刷新后剧情');
    expect(panelAfter.sessionId).toBe('second-session');
    expect(panelAfter.turnCount).toBe(1);
  });
});
