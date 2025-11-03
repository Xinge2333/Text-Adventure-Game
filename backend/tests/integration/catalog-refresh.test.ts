import { buildServer } from '../../src/index';
import fs from 'node:fs/promises';
import path from 'node:path';

const INDEX_PATH = path.resolve(
  __dirname,
  '../../../specs/001-speckit-specify-wechat/contracts/theme-index.mock.json'
);

let originalIndex = '';

describe('Catalog refresh integration', () => {
  beforeAll(async () => {
    originalIndex = await fs.readFile(INDEX_PATH, 'utf8');
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

  afterAll(async () => {
    await fs.writeFile(INDEX_PATH, originalIndex, 'utf8');
  });

  it('returns 304 when version unchanged and 200 with new catalog version', async () => {
    const app = buildServer();
    try {
      const initial = await app.inject({ method: 'GET', url: '/themes' });
      expect(initial.statusCode).toBe(200);
      const initialBody = initial.json();
      const initialVersion = initialBody.catalogVersion;

      const notModified = await app.inject({
        method: 'GET',
        url: `/themes?clientVersion=${initialVersion}`
      });
      expect(notModified.statusCode).toBe(304);

      const updatedIndex = {
        ...initialBody,
        catalogVersion: `${initialVersion}-updated`
      };
      await fs.writeFile(INDEX_PATH, JSON.stringify(updatedIndex, null, 2), 'utf8');

      await app.inject({ method: 'DELETE', url: '/__catalog-demo' });

      const refreshed = await app.inject({
        method: 'GET',
        url: `/themes?clientVersion=${initialVersion}`
      });
      expect(refreshed.statusCode).toBe(200);
      const refreshedBody = refreshed.json();
      expect(refreshedBody.catalogVersion).toBe(`${initialVersion}-updated`);
    } finally {
      await app.close();
    }
  });
});
