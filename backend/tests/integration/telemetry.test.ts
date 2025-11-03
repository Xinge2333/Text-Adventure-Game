import { buildServer } from '../../src/index';

describe('Telemetry ingestion', () => {
  beforeAll(() => {
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
    process.env.CATALOG_REFRESH_DISABLED = 'true';
  });

  it('accepts telemetry payload and returns 202', async () => {
    const app = buildServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/telemetry/turns',
        payload: {
          sessionId: 'demo-session',
          themeId: 'cyber-detective',
          turnIndex: 1,
          latencyMs: 1500,
          outcome: 'success',
          timestamp: '2025-10-13T00:00:00.000Z'
        }
      });

      expect(response.statusCode).toBe(202);
    } finally {
      await app.close();
    }
  });
});
