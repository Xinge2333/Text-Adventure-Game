import fs from 'node:fs/promises';
import path from 'node:path';

interface ThemeHistoryStats {
  plays: number;
  optionClicks: number;
  skips: number;
  lastPlayedAt?: string;
  maxTurnDepth?: number;
}

interface UserHistory {
  [themeId: string]: ThemeHistoryStats;
}

interface BehaviorStoreShape {
  userHistory: Record<string, UserHistory>;
  themeStats: Record<
    string,
    {
      plays: number;
      favorites: number;
      optionClicks: number;
      skips: number;
      lastPlayedAt?: string;
    }
  >;
}

const resolveStorePath = () =>
  path.resolve(process.cwd(), process.env.BEHAVIOR_STORE_PATH ?? 'snapshots/behavior-store.json');

let loaded = false;
let store: BehaviorStoreShape = {
  userHistory: {},
  themeStats: {}
};

const ensureLoaded = async () => {
  if (loaded) return;
  const storePath = resolveStorePath();
  try {
    const contents = await fs.readFile(storePath, 'utf8');
    store = JSON.parse(contents) as BehaviorStoreShape;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw error;
    }
  }
  loaded = true;
};

const persist = async () => {
  const storePath = resolveStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
};

const touchUserTheme = (userId: string, themeId: string): ThemeHistoryStats => {
  const history = (store.userHistory[userId] = store.userHistory[userId] ?? {});
  const entry =
    (history[themeId] =
      history[themeId] ?? {
        plays: 0,
        optionClicks: 0,
        skips: 0
      });
  return entry;
};

const touchThemeStats = (themeId: string) => {
  store.themeStats[themeId] =
    store.themeStats[themeId] ?? ({ plays: 0, favorites: 0, optionClicks: 0, skips: 0 } as const);
  return store.themeStats[themeId];
};

export const behaviorStore = {
  async recordPlay(userId: string, themeId: string): Promise<void> {
    await ensureLoaded();
    const now = new Date().toISOString();
    const entry = touchUserTheme(userId, themeId);
    entry.plays += 1;
    entry.lastPlayedAt = now;
    const themeStats = touchThemeStats(themeId);
    themeStats.plays += 1;
    themeStats.lastPlayedAt = now;
    await persist();
  },

  async recordOption(
    userId: string,
    themeId: string,
    turnDepth = 0
  ): Promise<{ previousOptionClicks: number; optionClicks: number; previousMaxTurnDepth: number; maxTurnDepth: number }> {
    await ensureLoaded();
    const entry = touchUserTheme(userId, themeId);
    const previousOptionClicks = entry.optionClicks;
    const previousMaxTurnDepth = entry.maxTurnDepth ?? 0;
    entry.optionClicks += 1;
    if (turnDepth > 0) {
      entry.maxTurnDepth = Math.max(previousMaxTurnDepth, turnDepth);
    }
    const themeStats = touchThemeStats(themeId);
    themeStats.optionClicks += 1;
    await persist();
    return {
      previousOptionClicks,
      optionClicks: entry.optionClicks,
      previousMaxTurnDepth,
      maxTurnDepth: entry.maxTurnDepth ?? 0
    };
  },

  async recordSkip(userId: string, themeId: string, turnDepth = 0): Promise<void> {
    await ensureLoaded();
    const entry = touchUserTheme(userId, themeId);
    entry.skips += 1;
    if (turnDepth > 0) {
      entry.maxTurnDepth = Math.max(entry.maxTurnDepth ?? 0, turnDepth);
    }
    touchThemeStats(themeId).skips = (store.themeStats[themeId]?.skips ?? 0) + 1;
    await persist();
  },

  async recordFavoritesDiff(added: string[], removed: string[]): Promise<void> {
    if (!added.length && !removed.length) {
      return;
    }
    await ensureLoaded();
    for (const themeId of added) {
      touchThemeStats(themeId).favorites += 1;
    }
    for (const themeId of removed) {
      touchThemeStats(themeId).favorites = Math.max(0, (store.themeStats[themeId]?.favorites ?? 0) - 1);
    }
    await persist();
  },

  async getUserHistory(userId: string): Promise<UserHistory> {
    await ensureLoaded();
    return store.userHistory[userId] ?? {};
  },

  async getThemeStats(themeId: string) {
    await ensureLoaded();
    return store.themeStats[themeId] ?? { plays: 0, favorites: 0, optionClicks: 0 };
  },

  async getAllThemeStats() {
    await ensureLoaded();
    return store.themeStats;
  },

  __reset() {
    loaded = false;
    store = { userHistory: {}, themeStats: {} };
  }
};
