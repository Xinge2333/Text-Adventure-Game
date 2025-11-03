import fs from 'node:fs/promises';
import path from 'node:path';
import { buildServer } from '../../src/index';
import { __resetUserStore } from '../../src/storage/userStore';
import { behaviorStore } from '../../src/storage/behaviorStore';

const STORE_PATH = path.resolve(__dirname, '../../../snapshots/test-user-store.json');
const BACKEND_STORE_PATH = path.resolve(__dirname, '../../snapshots/test-user-store.json');
const BEHAVIOR_PATH = path.resolve(__dirname, '../../../snapshots/test-behavior-store.json');

describe('Auth & profile', () => {
  beforeAll(async () => {
    await fs.rm(STORE_PATH, { force: true });
    await fs.rm(BACKEND_STORE_PATH, { force: true });
    await fs.rm(BEHAVIOR_PATH, { force: true });
    __resetUserStore();
    behaviorStore.__reset();
    process.env.USER_STORE_PATH = '../snapshots/test-user-store.json';
    process.env.BEHAVIOR_STORE_PATH = '../snapshots/test-behavior-store.json';
    process.env.COS_BUCKET = 'demo-bucket';
    process.env.COS_REGION = 'ap-demo';
    process.env.COS_ACCESS_KEY = 'demo';
    process.env.COS_SECRET_KEY = 'demo';
    process.env.COS_INDEX_KEY = 'catalog/index.json';
    process.env.COS_LOCAL_PATH = '../specs/001-speckit-specify-wechat/contracts/theme-index.mock.json';
    process.env.LLM_PROVIDER = 'qwen';
    process.env.LM_API_KEY = 'demo';
    process.env.QWEN_API_KEY = 'demo';
    process.env.QWEN_MOCK = 'true';
    process.env.LLM_MOCK = 'true';
    process.env.TELEMETRY_ENDPOINT = 'http://localhost:0';
    process.env.TELEMETRY_ENABLED = 'false';
    process.env.WECHAT_MOCK = 'true';
    process.env.CATALOG_REFRESH_DISABLED = 'true';
  });

  afterAll(async () => {
    await fs.rm(STORE_PATH, { force: true });
    await fs.rm(BACKEND_STORE_PATH, { force: true });
    await fs.rm(BEHAVIOR_PATH, { force: true });
    __resetUserStore();
    behaviorStore.__reset();
  });

  it('creates a session and persists favorites', async () => {
    const app = buildServer();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { code: 'login-code', nickName: 'Spec User' }
      });

      expect(login.statusCode).toBe(200);
      const loginBody = login.json();
      expect(loginBody.sessionToken).toBeDefined();
      expect(loginBody.user.profile.nickName).toBe('Spec User');

      const token = loginBody.sessionToken as string;

      const profile = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { 'x-session-token': token }
      });

      expect(profile.statusCode).toBe(200);
      expect(profile.json().user.favorites).toEqual([]);

      const update = await app.inject({
        method: 'PUT',
        url: '/me/favorites',
        headers: { 'x-session-token': token },
        payload: {
          favorites: [
            {
              themeId: 'palace-survival',
              title: '宫廷生存',
              description: '后宫权谋'
            }
          ]
        }
      });

      expect(update.statusCode).toBe(200);
      expect(update.json().favorites).toHaveLength(1);

      const relogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { code: 'login-code' }
      });

      expect(relogin.statusCode).toBe(200);
      expect(relogin.json().user.favorites).toHaveLength(1);

      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-session-token': token }
      });

      expect(logout.statusCode).toBe(200);

      const afterLogout = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { 'x-session-token': token }
      });

      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
