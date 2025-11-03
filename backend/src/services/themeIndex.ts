import { storage } from '../storage/cosStorage';

export interface ThemeMetadata {
  themeId: string;
  title: string;
  description: string;
  tags: string[];
  lastUpdated: string;
  promptPath: string;
  primaryTag?: string;
  keywords?: string[];
  tone?: string;
  maturity?: string;
  series?: string;
  wordCount?: number;
}

export interface CatalogIndex {
  catalogVersion: string;
  themes: ThemeMetadata[];
  generatedAt?: string;
  tagSummary?: { tag: string; count: number }[];
}

let cachedIndex: CatalogIndex | null = null;
let lastLoaded = 0;
let refreshTimer: NodeJS.Timeout | null = null;

const FIVE_MINUTES = 5 * 60 * 1000;

export const refreshCatalogIndex = async (): Promise<CatalogIndex> => {
  const index = await storage.fetchCatalogIndex();
  cachedIndex = index;
  lastLoaded = Date.now();
  return index;
};

export const getCatalogIndex = async (): Promise<CatalogIndex> => {
  const now = Date.now();

  if (cachedIndex && now - lastLoaded < FIVE_MINUTES) {
    return cachedIndex;
  }

  return refreshCatalogIndex();
};

export const clearCatalogCache = () => {
  cachedIndex = null;
  lastLoaded = 0;
};

export const scheduleCatalogRefresh = (intervalMs = FIVE_MINUTES) => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(() => {
    void refreshCatalogIndex();
  }, intervalMs);
};

export const stopCatalogRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};
