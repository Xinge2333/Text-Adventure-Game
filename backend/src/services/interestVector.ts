import { userStore } from '../storage/userStore';
import { getCatalogIndex } from './themeIndex';

const OPTION_CLICK_WEIGHT = 0.4;
const OPTION_CLICK_CAP = 3.0;
const TURN_DEPTH_WEIGHT = 0.2;
const TURN_DEPTH_CAP = 2.0;
const COMPLETION_BONUS = 3.0;
const FAVORITE_BONUS = 2.0;
const SKIP_PENALTY_SHALLOW = -1.2;
const SKIP_PENALTY_MID = -0.8;
const SKIP_PENALTY_DEEP = -0.3;
const DECAY_FACTOR = 0.96;
const LABEL_MAX = 10;
const LABEL_MIN = -5;
const LABEL_TOP_K = 50;
const EPSILON = 0.01;

const themeTagCache = new Map<string, string[]>();

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

const loadTagsForTheme = async (themeId: string): Promise<string[]> => {
  if (themeTagCache.size === 0) {
    const catalog = await getCatalogIndex();
    catalog.themes.forEach((theme) => {
      themeTagCache.set(
        theme.themeId,
        (theme.tags ?? []).map((tag) => normalizeTag(tag)).filter(Boolean)
      );
    });
  }
  const cached = themeTagCache.get(themeId) ?? [];
  if (cached.length) {
    return cached;
  }
  return [normalizeTag(themeId)];
};

const toInterestMap = (vector: Record<string, number> | undefined) => {
  const map = new Map<string, number>();
  if (!vector) {
    return map;
  }
  Object.entries(vector).forEach(([tag, weight]) => {
    if (Number.isFinite(weight)) {
      map.set(normalizeTag(tag), weight);
    }
  });
  return map;
};

const applyDecay = (map: Map<string, number>) => {
  if (DECAY_FACTOR >= 1) {
    return;
  }
  for (const [tag, weight] of map.entries()) {
    const decayed = weight * DECAY_FACTOR;
    if (Math.abs(decayed) < EPSILON) {
      map.delete(tag);
    } else {
      map.set(tag, decayed);
    }
  }
};

const clamp = (value: number) => Math.min(LABEL_MAX, Math.max(LABEL_MIN, value));

const applyTagDelta = (map: Map<string, number>, tags: string[], delta: number) => {
  if (!delta || !Number.isFinite(delta)) {
    return;
  }
  tags.forEach((rawTag) => {
    const tag = normalizeTag(rawTag);
    if (!tag) {
      return;
    }
    const next = clamp((map.get(tag) ?? 0) + delta);
    if (Math.abs(next) < EPSILON) {
      map.delete(tag);
    } else {
      map.set(tag, next);
    }
  });
};

const limitTopK = (map: Map<string, number>) => {
  if (map.size <= LABEL_TOP_K) {
    return;
  }
  const sorted = [...map.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  map.clear();
  sorted.slice(0, LABEL_TOP_K).forEach(([tag, weight]) => {
    map.set(tag, weight);
  });
};

const persistInterest = async (userId: string, map: Map<string, number>) => {
  limitTopK(map);
  const vector = Object.fromEntries(map.entries());
  await userStore.updateInterestVector(userId, vector);
};

const withInterestVector = async (
  userId: string,
  updater: (map: Map<string, number>) => void,
  { decay = true }: { decay?: boolean } = {}
) => {
  const user = await userStore.getByUserId(userId);
  if (!user) {
    return;
  }
  const map = toInterestMap(user.interestVector);
  if (decay) {
    applyDecay(map);
  }
  updater(map);
  await persistInterest(userId, map);
};

export const interestVectorService = {
  async applyOptionInteraction(params: {
    userId: string;
    themeId: string;
    tags?: string[];
    previousOptionClicks: number;
    optionClicks: number;
    previousMaxTurnDepth: number;
    maxTurnDepth: number;
    completed: boolean;
  }) {
    const tags = params.tags?.length ? params.tags.map(normalizeTag) : await loadTagsForTheme(params.themeId);
    if (!tags.length) {
      return;
    }

    const optionBefore = Math.min(params.previousOptionClicks * OPTION_CLICK_WEIGHT, OPTION_CLICK_CAP);
    const optionAfter = Math.min(params.optionClicks * OPTION_CLICK_WEIGHT, OPTION_CLICK_CAP);
    const optionDelta = optionAfter - optionBefore;

    const depthBefore = Math.min(params.previousMaxTurnDepth * TURN_DEPTH_WEIGHT, TURN_DEPTH_CAP);
    const depthAfter = Math.min(params.maxTurnDepth * TURN_DEPTH_WEIGHT, TURN_DEPTH_CAP);
    const depthDelta = depthAfter - depthBefore;

    await withInterestVector(params.userId, (map) => {
      applyTagDelta(map, tags, optionDelta);
      if (depthDelta > 0) {
        applyTagDelta(map, tags, depthDelta);
      }
      if (params.completed) {
        applyTagDelta(map, tags, COMPLETION_BONUS);
      }
    });
  },

  async applySkip(params: { userId: string; themeId: string; tags?: string[]; turnCount: number }) {
    const tags = params.tags?.length ? params.tags.map(normalizeTag) : await loadTagsForTheme(params.themeId);
    if (!tags.length) {
      return;
    }
    const depth = Math.max(0, params.turnCount);
    const penalty = depth >= 4 ? SKIP_PENALTY_DEEP : depth >= 2 ? SKIP_PENALTY_MID : SKIP_PENALTY_SHALLOW;
    await withInterestVector(params.userId, (map) => {
      applyTagDelta(map, tags, penalty);
    });
  },

  async applyFavoriteAddition(params: { userId: string; themeId: string; tags?: string[] }) {
    const tags = params.tags?.length ? params.tags.map(normalizeTag) : await loadTagsForTheme(params.themeId);
    if (!tags.length) {
      return;
    }
    await withInterestVector(params.userId, (map) => {
      applyTagDelta(map, tags, FAVORITE_BONUS);
    }, { decay: false });
  }
};
