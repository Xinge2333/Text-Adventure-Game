import { api } from '../../utils/api';
import { storage } from '../../utils/storage';
import { submitTurnTelemetry } from '../../utils/telemetry';

const DEFAULT_THEME_ID = 'palace-survival';
const MAX_PARALLEL_LOADS = 3;

const createPanelState = (themeId, title = '', metadata = {}) => ({
  themeId,
  title,
  description: metadata.description || '',
  sessionId: '',
  narrative: '',
  options: [],
  ending: false,
  moderationMessage: '',
  turnCount: 0,
  isLoading: false,
  pendingAction: '',
  isInitialized: false,
  lastError: '',
  scrollTop: 0,
  recommendationReason: metadata.reason || '',
  recSetId: metadata.recSetId || '',
  recPosition: typeof metadata.position === 'number' ? metadata.position : null,
  hasInteracted: false,
  skipRecorded: false,
  isFavorite: Boolean(metadata.isFavorite)
});

Page({
  currentModelProvider: 'qwen',
  loadingQueue: [],
  activeLoads: null,
  panelIndexMap: {},
  panelScrollPositions: {},
  recommendationReasons: null,
  isSwiperAnimating: false,
  pendingScrollRestore: null,
  nightModeUnsubscribe: null,
  favoritesList: [],
  favoriteMapCache: {},

  data: {
    themePanels: [],
    activeIndex: 0,
    nightMode: false,
    activeLoading: false,
    activePendingAction: '',
    favoriteMap: {}
  },

  onLoad(query = {}) {
    this.loadingQueue = [];
    this.activeLoads = new Set();
    this.panelIndexMap = {};
    this.panelScrollPositions = {};
    this.registerNightModeListener();

    const app = getApp();
    let themeId = query?.themeId;

    if (!themeId && app?.globalData?.pendingThemeId) {
      themeId = app.globalData.pendingThemeId;
      app.globalData.pendingThemeId = '';
    }

    if (!themeId) {
      themeId = DEFAULT_THEME_ID;
    }

    void this.initializeThemePanels(themeId);
  },

  onShow() {
    this.setTabBarIndex(0);
    const app = getApp();
    const pending = app?.globalData?.pendingThemeId;
    if (pending) {
      app.globalData.pendingThemeId = '';
      this.switchToTheme(pending);
    }
    this.refreshFavoriteState();
  },

  onUnload() {
    this.teardownNightModeListener();
  },

  async initializeThemePanels(initialThemeId) {
    try {
      const [recommendations, themesResponse] = await Promise.all([
        api.getRecommendations({ limit: 6 }).catch(() => ({ items: [] })),
        api.listThemes()
      ]);

      const themes = Array.isArray(themesResponse?.themes) ? themesResponse.themes : [];
      const recommendationItems = Array.isArray(recommendations?.items) ? recommendations.items : [];
      const recommendationMap = new Map();
      const recommendationMetaMap = new Map();
      const orderedIds = [];
      const recSetId = recommendations?.recSetId;
      recommendationItems.forEach((item) => {
        if (item?.themeId) {
          orderedIds.push(item.themeId);
          recommendationMap.set(item.themeId, item.reason || '猜你喜欢');
          recommendationMetaMap.set(item.themeId, {
            reason: item.reason || '猜你喜欢',
            recSetId,
            position: item.position ?? null
          });
        }
      });
      this.recommendationReasons = recommendationMap;

      const orderedThemes = [
        ...orderedIds
          .map((id) => themes.find((theme) => theme.themeId === id))
          .filter(Boolean),
        ...themes.filter((theme) => !orderedIds.includes(theme.themeId))
      ];

      const panels = orderedThemes.map((theme) =>
        createPanelState(
          theme.themeId,
          theme.title,
          Object.assign({}, recommendationMetaMap.get(theme.themeId) || {}, {
            description: theme.description || ''
          })
        )
      );

      const preferredInitial = orderedIds[0] ?? initialThemeId;
      let activeIndex = panels.findIndex((item) => item.themeId === preferredInitial);
      if (activeIndex === -1) {
        panels.push(createPanelState(preferredInitial));
        activeIndex = panels.length - 1;
      }

      const panelIndexMap = {};
      panels.forEach((panel, index) => {
        panelIndexMap[panel.themeId] = index;
      });
      this.panelIndexMap = panelIndexMap;

      this.setData({ themePanels: panels, activeIndex }, () => {
        this.refreshFavoriteState();
      });
      this.ensurePanelLoaded(panels[activeIndex]?.themeId);
      this.restorePanelScroll(panels[activeIndex]?.themeId, panels[activeIndex]?.scrollTop || 0);
    } catch (error) {
      console.warn('Failed to initialize theme list', error);
      wx.showToast({ title: '加载主题失败', icon: 'none' });
      this.panelIndexMap = { [initialThemeId]: 0 };
      this.setData({ themePanels: [createPanelState(initialThemeId)], activeIndex: 0 }, () => {
        this.refreshFavoriteState();
      });
      this.ensurePanelLoaded(initialThemeId);
    }
  },

  getPanelIndex(themeId) {
    const index = this.panelIndexMap?.[themeId];
    if (typeof index === 'number') {
      return index;
    }
    const fallbackIndex = this.data.themePanels.findIndex((item) => item.themeId === themeId);
    if (fallbackIndex >= 0) {
      this.panelIndexMap[themeId] = fallbackIndex;
    }
    return fallbackIndex;
  },

  applyPanelUpdates(themeId, updates) {
    const index = this.getPanelIndex(themeId);
    if (index < 0) {
      return;
    }
    const dataUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      dataUpdates[`themePanels[${index}].${key}`] = value;
    });
    this.setData(dataUpdates);
    this.updateActivePanelState();
  },

  ensurePanelLoaded(themeId) {
    if (!themeId) {
      return;
    }
    const index = this.getPanelIndex(themeId);
    if (index < 0) {
      return;
    }
    const panel = this.data.themePanels[index];
    if (panel.isLoading || panel.pendingAction || panel.isInitialized) {
      return;
    }
    this.enqueuePanelJob({ themeId, action: 'start', payload: {} });
  },

  enqueuePanelJob(job) {
    const { themeId } = job;
    const panel = this.getPanel(themeId);
    if (!panel) {
      return;
    }

    this.loadingQueue = this.loadingQueue.filter((item) => item.themeId !== themeId);
    this.loadingQueue.push(job);
    this.applyPanelUpdates(themeId, {
      pendingAction: job.action,
      isLoading: true,
      lastError: job.action === 'start' ? '' : panel.lastError
    });

    this.processQueue();
  },

  processQueue() {
    if (this.activeLoads.size >= MAX_PARALLEL_LOADS) {
      return;
    }

    const job = this.loadingQueue.shift();
    if (!job) {
      return;
    }

    if (this.activeLoads.has(job.themeId)) {
      this.loadingQueue.push(job);
      return;
    }

    this.activeLoads.add(job.themeId);
    void this.runPanelJob(job);
  },

  async runPanelJob(job) {
    const { themeId, action, payload } = job;
    const index = this.getPanelIndex(themeId);
    if (index < 0) {
      this.finishPanelJob(themeId);
      return;
    }

    const panel = this.data.themePanels[index];
    try {
      if (action === 'start') {
        await this.runStartJob(panel);
      } else if (action === 'advance') {
        await this.runAdvanceJob(panel, payload);
      } else if (action === 'refresh') {
        await this.runRefreshJob(panel);
      }
    } catch (error) {
      this.handlePanelError(themeId, error);
    } finally {
      this.finishPanelJob(themeId);
    }
  },

  async runStartJob(panel) {
    const modelProvider = this.getModelProvider();
    const response = await api.startStory({ themeId: panel.themeId, modelProvider });
    this.applyPanelResponse(panel.themeId, response, { resetSession: true });
    this.applyPanelUpdates(panel.themeId, { hasInteracted: false, skipRecorded: false });
  },

  async runRefreshJob(panel) {
    const modelProvider = this.getModelProvider();
    const response = await api.startStory({ themeId: panel.themeId, modelProvider });
    this.applyPanelResponse(panel.themeId, response, { resetSession: true });
    this.applyPanelUpdates(panel.themeId, { hasInteracted: false, skipRecorded: false });
  },

  async runAdvanceJob(panel, payload = {}) {
    if (!panel.sessionId) {
      throw new Error('会话不存在，无法继续');
    }
    const modelProvider = this.getModelProvider();
    const { selectedOption, customInput } = payload;
    const requestPayload = {
      sessionId: panel.sessionId,
      selectedOption,
      modelProvider
    };
    if (typeof customInput === 'string' && customInput) {
      requestPayload.customOptionText = customInput;
    }
    const response = await api.advanceStory(requestPayload);
    this.applyPanelUpdates(panel.themeId, { hasInteracted: true });

    submitTurnTelemetry({
      sessionIdHash: panel.sessionId,
      themeId: panel.themeId,
      turnIndex: response.turnIndex,
      latencyMs: response.latencyMs ?? 0,
      outcome: response.outcome || (response.ending ? 'success' : 'success'),
      timestamp: new Date().toISOString()
    });

    this.applyPanelResponse(panel.themeId, response, { resetSession: response.ending });
  },

  applyPanelResponse(themeId, response, options = {}) {
    const index = this.getPanelIndex(themeId);
    if (index < 0) {
      return;
    }
    const panelPath = `themePanels[${index}]`;
    const updates = {
      [`${panelPath}.sessionId`]: options.resetSession ? response.sessionId : response.sessionId ?? this.data.themePanels[index].sessionId,
      [`${panelPath}.narrative`]: response.narrative || '',
      [`${panelPath}.options`]: response.options ?? [],
      [`${panelPath}.ending`]: response.ending ?? false,
      [`${panelPath}.moderationMessage`]: response.moderationMessage ?? '',
      [`${panelPath}.turnCount`]: typeof response.turnIndex === 'number' ? response.turnIndex + 1 : this.data.themePanels[index].turnCount,
      [`${panelPath}.isInitialized`]: true,
      [`${panelPath}.lastError`]: '',
      [`${panelPath}.skipRecorded`]: false
    };
    if (options.resetSession) {
      updates[`${panelPath}.hasInteracted`] = false;
      updates[`${panelPath}.skipRecorded`] = false;
    }
    if (options.resetSession && response.ending) {
      updates[`${panelPath}.sessionId`] = '';
    }
    this.setData(updates);
    this.updateActivePanelState();
  },

  finishPanelJob(themeId) {
    this.activeLoads.delete(themeId);
    this.applyPanelUpdates(themeId, { isLoading: false, pendingAction: '' });
    this.updateActivePanelState();
    setTimeout(() => {
      this.processQueue();
    }, 0);
  },

  handlePanelError(themeId, error) {
    const message = error?.message || '加载失败，请重试';
    this.applyPanelUpdates(themeId, { lastError: message });
    const activePanel = this.data.themePanels[this.data.activeIndex];
    if (activePanel?.themeId === themeId) {
      wx.showToast({ title: message, icon: 'none' });
    }
  },

  getPanel(themeId) {
    const index = this.getPanelIndex(themeId);
    return index >= 0 ? this.data.themePanels[index] : null;
  },

  getModelProvider() {
    const app = getApp();
    const provider = app?.globalData?.preferredModel || this.currentModelProvider || 'qwen';
    this.currentModelProvider = provider;
    return provider;
  },

  updateActivePanelState() {
    const activePanel = this.data.themePanels[this.data.activeIndex];
    if (!activePanel) {
      this.setData({ activeLoading: false, activePendingAction: '' });
      return;
    }
    this.setData({
      activeLoading: Boolean(activePanel.isLoading),
      activePendingAction: activePanel.pendingAction || ''
    });
  },

  onSwitchTheme(event) {
    const { direction } = event.currentTarget.dataset;
    if (direction === 'up') {
      this.switchPanel(-1);
    } else if (direction === 'down') {
      this.switchPanel(1);
    }
  },

  switchPanel(offset) {
    if (!offset) {
      return;
    }
    if (this.isSwiperAnimating) {
      return;
    }
    const nextIndex = this.data.activeIndex + offset;
    if (nextIndex < 0) {
      wx.showToast({ title: '已经是第一个主题', icon: 'none' });
      return;
    }
    if (nextIndex >= this.data.themePanels.length) {
      wx.showToast({ title: '没有更多主题', icon: 'none' });
      return;
    }

    const currentPanel = this.data.themePanels[this.data.activeIndex];
    if (currentPanel) {
      this.persistScrollPosition(currentPanel.themeId);
      void this.maybeReportSkip(currentPanel);
    }

    const nextPanel = this.data.themePanels[nextIndex];
    if (!nextPanel) {
      return;
    }

    this.isSwiperAnimating = true;
    this.setData({ activeIndex: nextIndex });
    if (nextPanel?.themeId) {
      this.ensurePanelLoaded(nextPanel.themeId);
      this.pendingScrollRestore = {
        themeId: nextPanel.themeId,
        scrollTop: nextPanel.scrollTop || 0
      };
    } else {
      this.pendingScrollRestore = null;
    }
    this.updateActivePanelState();
  },

  onSwiperChange(event) {
    const { current = 0 } = event.detail || {};
    if (typeof current !== 'number') {
      return;
    }
    const previousPanel = this.data.themePanels[this.data.activeIndex];
    if (previousPanel) {
      this.persistScrollPosition(previousPanel.themeId);
      void this.maybeReportSkip(previousPanel);
    }

    const isSame = current === this.data.activeIndex;
    this.setData({ activeIndex: current });
    const activePanel = this.data.themePanels[current];
    this.ensurePanelLoaded(activePanel?.themeId);
    if (this.isSwiperAnimating) {
      this.pendingScrollRestore = {
        themeId: activePanel?.themeId,
        scrollTop: activePanel?.scrollTop || 0
      };
    } else {
      this.restorePanelScroll(activePanel?.themeId, activePanel?.scrollTop || 0);
    }
    if (!isSame) {
      this.updateActivePanelState();
    }
  },

  onSwiperAnimationFinish() {
    if (this.pendingScrollRestore?.themeId) {
      const { themeId, scrollTop = 0 } = this.pendingScrollRestore;
      this.restorePanelScroll(themeId, scrollTop);
    }
    this.pendingScrollRestore = null;
    this.isSwiperAnimating = false;
  },

  switchToTheme(themeId) {
    const index = this.getPanelIndex(themeId);
    if (index < 0) {
      return;
    }
    const offset = index - this.data.activeIndex;
    if (offset === 0) {
      this.ensurePanelLoaded(themeId);
      return;
    }
    this.switchPanel(offset);
  },

  onPanelRefresh(event) {
    const { themeid } = event.currentTarget.dataset;
    const panel = this.getPanel(themeid);
    if (!panel || panel.isLoading) {
      return;
    }
    this.enqueuePanelJob({ themeId: themeid, action: 'refresh', payload: {} });
  },

  onPanelRestart(event) {
    const { themeid } = event.currentTarget.dataset;
    const panel = this.getPanel(themeid);
    if (!panel || panel.isLoading) {
      return;
    }
    this.enqueuePanelJob({ themeId: themeid, action: 'start', payload: { restart: true } });
  },

  onPanelOption(event) {
    const { themeid, index } = event.currentTarget.dataset;
    const panel = this.getPanel(themeid);
    if (!panel || panel.isLoading || panel.ending) {
      return;
    }
    const optionIndex = Number(index);
    if (Number.isNaN(optionIndex)) {
      return;
    }

    if (optionIndex === 3) {
      this.promptCustomOption(panel);
      return;
    }

    this.enqueuePanelJob({
      themeId: themeid,
      action: 'advance',
      payload: { selectedOption: optionIndex + 1 }
    });
  },

  promptCustomOption(panel) {
    if (!panel || panel.isLoading || panel.ending) {
      return;
    }

    wx.showModal({
      title: '自定义选项',
      editable: true,
      placeholderText: '请输入不超过100词的内容',
      confirmText: '发送',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        const rawInput = typeof res.content === 'string' ? res.content : '';
        const trimmed = rawInput.trim();
        if (!trimmed) {
          wx.showToast({ title: '内容不能为空', icon: 'none' });
          return;
        }

        const words = trimmed.split(/\s+/).filter(Boolean);
        const charCount = Array.from(trimmed).length;
        if (words.length > 100 || charCount > 100) {
          wx.showToast({ title: '请输入不超过100词', icon: 'none' });
          return;
        }

        this.enqueuePanelJob({
          themeId: panel.themeId,
          action: 'advance',
          payload: {
            selectedOption: 4,
            customInput: trimmed
          }
        });
      }
    });
  },

  onReturnHome() {
    wx.switchTab({ url: '/pages/catalog/index' });
  },

  onPanelScroll(event) {
    const { themeid } = event.currentTarget.dataset;
    const scrollTop = event.detail?.scrollTop ?? 0;
    if (!themeid) {
      return;
    }
    if (!this.panelScrollPositions) {
      this.panelScrollPositions = {};
    }
    this.panelScrollPositions[themeid] = scrollTop;
  },

  persistScrollPosition(themeId) {
    if (!themeId || !this.panelScrollPositions) {
      return;
    }
    const stored = this.panelScrollPositions[themeId];
    if (typeof stored === 'number') {
      this.applyPanelUpdates(themeId, { scrollTop: stored });
    }
  },

  restorePanelScroll(themeId, scrollTop = 0) {
    if (!themeId) {
      return;
    }
    let target = scrollTop;
    const stored = this.panelScrollPositions?.[themeId];
    if (typeof stored === 'number') {
      target = stored;
    }
    this.applyPanelUpdates(themeId, { scrollTop: target });
  },

  setTabBarIndex(index) {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar && typeof tabBar.setSelected === 'function') {
        tabBar.setSelected(index);
      }
    }
  },

  async maybeReportSkip(panel) {
    if (!panel || panel.skipRecorded || panel.isLoading) {
      return;
    }
    if (panel.ending) {
      return;
    }
    try {
      await api.reportSkip({
        themeId: panel.themeId,
        recSetId: panel.recSetId,
        position: panel.recPosition,
        reason: panel.recommendationReason,
        turnCount: panel.turnCount || 0
      });
      this.applyPanelUpdates(panel.themeId, { skipRecorded: true });
    } catch (error) {
      console.warn('report skip failed', error);
    }
  },

  resolveFavorites() {
    const app = getApp();
    if (app?.globalData?.userProfile?.favorites) {
      const serverFavorites = app.globalData.userProfile.favorites || [];
      storage.setFavorites(serverFavorites);
      return serverFavorites;
    }
    return storage.getFavorites();
  },

  refreshFavoriteState() {
    const favorites = this.resolveFavorites();
    this.favoritesList = Array.isArray(favorites) ? favorites.slice() : [];
    const favoriteMap = {};
    this.favoritesList.forEach((item) => {
      if (item?.themeId) {
        favoriteMap[item.themeId] = item;
      }
    });
    this.favoriteMapCache = favoriteMap;

    if (!Array.isArray(this.data.themePanels) || !this.data.themePanels.length) {
      this.setData({ favoriteMap });
      return;
    }

    const updates = { favoriteMap };
    this.data.themePanels.forEach((panel, index) => {
      const isFavorite = Boolean(favoriteMap[panel.themeId]);
      if (panel.isFavorite !== isFavorite) {
        updates[`themePanels[${index}].isFavorite`] = isFavorite;
      }
    });

    this.setData(updates);
  },

  onToggleFavoriteActive() {
    const activePanel = this.data.themePanels[this.data.activeIndex];
    if (!activePanel || !activePanel.themeId) {
      return;
    }
    if (activePanel.isLoading) {
      wx.showToast({ title: '加载中，请稍候', icon: 'none' });
      return;
    }

    const isFavorite = Boolean(this.favoriteMapCache?.[activePanel.themeId]);
    const favorites = Array.isArray(this.favoritesList) ? [...this.favoritesList] : [];
    const existingIndex = favorites.findIndex((item) => item?.themeId === activePanel.themeId);

    if (isFavorite && existingIndex >= 0) {
      favorites.splice(existingIndex, 1);
    } else if (!isFavorite) {
      favorites.push({
        themeId: activePanel.themeId,
        title: activePanel.title || '',
        description: activePanel.description || ''
      });
    }

    this.favoritesList = favorites;
    storage.setFavorites(favorites);

    const app = getApp();
    if (app && app.globalData) {
      if (!app.globalData.userProfile) {
        app.globalData.userProfile = { profile: {} };
      }
      app.globalData.userProfile.favorites = favorites;
    }

    void this.persistFavorites(favorites);
    this.refreshFavoriteState();
    wx.showToast({ title: isFavorite ? '已取消收藏' : '已收藏', icon: 'none' });
  },

  async persistFavorites(favorites) {
    const app = getApp();
    if (!app?.globalData?.sessionToken) {
      return;
    }
    try {
      await api.updateFavorites(favorites);
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
  }
});
