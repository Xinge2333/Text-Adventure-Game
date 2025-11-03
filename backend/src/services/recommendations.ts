import { getCatalogIndex, type ThemeMetadata } from './themeIndex';
import { behaviorStore } from '../storage/behaviorStore';
import { userStore } from '../storage/userStore';

interface ThemeScore {
  theme: ThemeMetadata;
  score: number;
  reason: string;
}

const FAVORITE_WEIGHT = 3;
const PLAY_WEIGHT = 1;
const OPTION_WEIGHT = 0.5;
const POPULARITY_WEIGHT = 0.15;
const FRESH_WEIGHT = 0.2;
const SKIP_PENALTY = 0.5;
const FRESH_HALF_LIFE_DAYS = 14;

const toLowerTags = (tags: string[]) => tags.map((tag) => tag.toLowerCase());

const addToVector = (vector: Map<string, number>, tags: string[], weight: number) => {
  tags.forEach((tag) => {
    const key = tag.toLowerCase();
    vector.set(key, (vector.get(key) ?? 0) + weight);
  });
};

const buildUserProfile = async (
  userId: string,
  themeById: Map<string, ThemeMetadata>,
  favoriteThemes: ThemeMetadata[]
): Promise<Map<string, number>> => {
  const profile = new Map<string, number>();
  favoriteThemes.forEach((theme) => addToVector(profile, theme.tags, FAVORITE_WEIGHT));

  const history = await behaviorStore.getUserHistory(userId);
  Object.entries(history).forEach(([themeId, stats]) => {
    const theme = themeById.get(themeId);
    if (!theme) return;
    const weight = stats.plays * PLAY_WEIGHT + stats.optionClicks * OPTION_WEIGHT;
    if (weight > 0) {
      addToVector(profile, theme.tags, weight);
    }
  });

  return profile;
};

const cosineSimilarity = (profile: Map<string, number>, theme: ThemeMetadata): number => {
  if (profile.size === 0 || theme.tags.length === 0) {
    return 0;
  }
  let dot = 0;
  let themeMag = 0;
  let profileMag = 0;

  theme.tags.forEach((tag) => {
    const weight = 1;
    themeMag += weight * weight;
    const profileWeight = profile.get(tag.toLowerCase()) ?? 0;
    if (profileWeight) {
      dot += profileWeight * weight;
    }
  });

  profile.forEach((value) => {
    profileMag += value * value;
  });

  if (themeMag === 0 || profileMag === 0) {
    return 0;
  }
  return dot / (Math.sqrt(themeMag) * Math.sqrt(profileMag));
};

const computeFreshness = (lastUpdated: string): number => {
  const updatedAt = new Date(lastUpdated).getTime();
  if (Number.isNaN(updatedAt)) {
    return 0;
  }
  const ageDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / FRESH_HALF_LIFE_DAYS);
};

const buildFavoriteThemes = (favoriteIds: string[], themeById: Map<string, ThemeMetadata>) =>
  favoriteIds
    .map((themeId) => themeById.get(themeId))
    .filter((theme): theme is ThemeMetadata => Boolean(theme));

const selectWithDiversity = (candidates: ThemeScore[], limit: number): ThemeScore[] => {
  const picked: ThemeScore[] = [];
  const tagUsage = new Map<string, number>();

  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    const primaryTag = candidate.theme.tags[0]?.toLowerCase() ?? candidate.theme.themeId;
    const usage = tagUsage.get(primaryTag) ?? 0;
    if (usage < 2 || picked.length < 3) {
      picked.push(candidate);
      tagUsage.set(primaryTag, usage + 1);
    }
  }

  if (picked.length < limit) {
    for (const candidate of candidates) {
      if (picked.length >= limit) break;
      if (!picked.find((item) => item.theme.themeId === candidate.theme.themeId)) {
        picked.push(candidate);
      }
    }
  }

  return picked.slice(0, limit);
};

export const getRecommendations = async (userId: string, limit = 5): Promise<ThemeScore[]> => {
  const catalog = await getCatalogIndex();
  const themeById = new Map<string, ThemeMetadata>();
  catalog.themes.forEach((theme) => {
    themeById.set(theme.themeId, { ...theme, tags: toLowerTags(theme.tags) });
  });

  const user = await userStore.getByUserId(userId);
  const profile = new Map<string, number>();
  if (user?.interestVector) {
    Object.entries(user.interestVector).forEach(([tag, weight]) => {
      if (Number.isFinite(weight)) {
        profile.set(tag.toLowerCase(), weight);
      }
    });
  }

  if (profile.size === 0) {
    const fallbackFavorites = buildFavoriteThemes(user?.favorites?.map((fav) => fav.themeId) ?? [], themeById);
    const fallbackProfile = await buildUserProfile(userId, themeById, fallbackFavorites);
    fallbackProfile.forEach((value, key) => {
      profile.set(key, value);
    });
  }
  const themeStats = await behaviorStore.getAllThemeStats();

  const scored = catalog.themes.map((theme) => {
    const normalizedTheme = themeById.get(theme.themeId)!;
    const similarity = cosineSimilarity(profile, normalizedTheme);
    const stats =
      themeStats[theme.themeId] ?? { plays: 0, favorites: 0, optionClicks: 0, skips: 0 };
    const popularity = stats.plays + stats.favorites * 2 + stats.optionClicks * 0.5;
    const fresh = computeFreshness(theme.lastUpdated);
    const skipPenalty = (stats.skips ?? 0) * SKIP_PENALTY;
    const score = similarity + POPULARITY_WEIGHT * popularity + FRESH_WEIGHT * fresh - skipPenalty;
    const topMatch = normalizedTheme.tags
      .map((tag) => ({ tag, weight: profile.get(tag) ?? 0 }))
      .sort((a, b) => (b.weight - a.weight || b.tag.localeCompare(a.tag)))[0];
    const reason = similarity > 0.15 && topMatch?.weight && topMatch.weight > 0
      ? `因为你喜欢 ${topMatch.tag}`
      : fresh > 0.4
        ? '新鲜上线'
        : '热门推荐';
    return { theme: theme as ThemeMetadata, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  return selectWithDiversity(scored, limit);
};
