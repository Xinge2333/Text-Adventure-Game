import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface FavoriteTheme {
  themeId: string;
  title?: string;
  description?: string;
}

export interface InterestVector {
  [tag: string]: number;
}

export interface UserRecord {
  userId: string;
  openId: string;
  favorites: FavoriteTheme[];
  profile: {
    nickName?: string;
    avatarUrl?: string;
  };
  interestVector?: InterestVector;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
}

interface PersistedStore {
  users: Record<string, UserRecord>;
}

let loaded = false;
let store: PersistedStore = {
  users: {}
};

const resolveStorePath = () =>
  path.resolve(process.cwd(), process.env.USER_STORE_PATH ?? 'snapshots/user-store.json');

const ensureLoaded = async () => {
  if (loaded) {
    return;
  }

  const storePath = resolveStorePath();

  try {
    const contents = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(contents) as PersistedStore;
    store = {
      users: parsed.users ?? {}
    };
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

const dedupeFavorites = (favorites: FavoriteTheme[]): FavoriteTheme[] => {
  const result: FavoriteTheme[] = [];
  const seen = new Set<string>();
  favorites.forEach((favorite) => {
    if (!favorite?.themeId) {
      return;
    }
    if (seen.has(favorite.themeId)) {
      return;
    }
    seen.add(favorite.themeId);
    result.push({
      themeId: favorite.themeId,
      title: favorite.title,
      description: favorite.description
    });
  });
  return result;
};

export const userStore = {
  async findOrCreateByOpenId(openId: string, profileUpdates: Partial<UserRecord['profile']> = {}): Promise<UserRecord> {
    await ensureLoaded();
    const now = new Date().toISOString();
    let user = Object.values(store.users).find((existing) => existing.openId === openId);

    if (!user) {
      user = {
        userId: randomUUID(),
        openId,
        favorites: [],
        profile: {},
        interestVector: {},
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      };
      store.users[user.userId] = user;
    }

    user.profile = {
      ...user.profile,
      ...profileUpdates
    };
    user.lastLoginAt = now;
    user.updatedAt = now;
    await persist();
    return user;
  },

  async issueSession(userId: string, ttlHours = 24 * 7): Promise<string> {
    await ensureLoaded();
    const user = store.users[userId];
    if (!user) {
      throw new Error('User not found');
    }
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    user.sessionToken = token;
    user.sessionExpiresAt = expiresAt.toISOString();
    user.updatedAt = new Date().toISOString();
    await persist();
    return token;
  },

  async getBySessionToken(sessionToken: string): Promise<UserRecord | null> {
    await ensureLoaded();
    const user = Object.values(store.users).find((record) => record.sessionToken === sessionToken);
    if (!user) {
      return null;
    }
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt).getTime() < Date.now()) {
      return null;
    }
    return user;
  },

  async getByUserId(userId: string): Promise<UserRecord | null> {
    await ensureLoaded();
    return store.users[userId] ?? null;
  },

  async revokeSession(sessionToken: string): Promise<void> {
    await ensureLoaded();
    const user = Object.values(store.users).find((record) => record.sessionToken === sessionToken);
    if (!user) {
      return;
    }
    delete user.sessionToken;
    delete user.sessionExpiresAt;
    user.updatedAt = new Date().toISOString();
    await persist();
  },

  async updateFavorites(userId: string, favorites: FavoriteTheme[]): Promise<UserRecord> {
    await ensureLoaded();
    const user = store.users[userId];
    if (!user) {
      throw new Error('User not found');
    }
    user.favorites = dedupeFavorites(favorites);
    user.updatedAt = new Date().toISOString();
    await persist();
    return user;
  },

  async updateInterestVector(userId: string, vector: InterestVector): Promise<UserRecord> {
    await ensureLoaded();
    const user = store.users[userId];
    if (!user) {
      throw new Error('User not found');
    }
    user.interestVector = vector;
    user.updatedAt = new Date().toISOString();
    await persist();
    return user;
  }
};

export const toPublicUser = (user: UserRecord) => ({
  userId: user.userId,
  profile: user.profile,
  favorites: user.favorites,
  lastLoginAt: user.lastLoginAt
});

export const __resetUserStore = () => {
  loaded = false;
  store = { users: {} };
};
