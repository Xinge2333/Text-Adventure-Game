import fs from 'node:fs/promises';
import path from 'node:path';
import { buildServer } from '../../src/index';
import { __resetUserStore } from '../../src/storage/userStore';
import { behaviorStore } from '../../src/storage/behaviorStore';

const STORE_PATH = path.resolve(__dirname, '../../../snapshots/test-user-store.json');
const BEHAVIOR_PATH = path.resolve(__dirname, '../../../snapshots/test-behavior-store.json');

describe('Recommendations API', () => {
  beforeAll(async () => {
    await fs.rm(STORE_PATH, { force: true });
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
    await fs.rm(BEHAVIOR_PATH, { force: true });
    __resetUserStore();
    behaviorStore.__reset();
  });

  it('returns personalized recommendations', async () => {
    const app = buildServer();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { code: 'rec-login' }
      });
      const token = login.json().sessionToken as string;

      await app.inject({
        method: 'PUT',
        url: '/me/favorites',
        headers: { 'x-session-token': token },
        payload: {
          favorites: [
            {
              themeId: 'palace-survival',
              title: '宫廷生存',
              description: '后宫博弈'
            }
          ]
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/recommendations?limit=3',
        headers: { 'x-session-token': token }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items[0].themeId).toBeDefined();

      const skip = await app.inject({
        method: 'POST',
        url: '/recommendations/skip',
        headers: { 'x-session-token': token },
        payload: { themeId: body.items[0].themeId }
      });
      expect(skip.statusCode).toBe(202);
    } finally {
      await app.close();
    }
  });
});
