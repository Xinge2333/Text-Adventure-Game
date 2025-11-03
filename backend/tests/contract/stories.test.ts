import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { buildServer } from '../../src/index';
import Ajv from 'ajv';

const schemasDir = path.resolve(__dirname, '../../../specs/001-speckit-specify-wechat/contracts');

const loadSchema = (name: string) => {
  const schemaPath = path.join(schemasDir, name);
  const raw = fs.readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw);
};

beforeAll(() => {
  process.env.COS_BUCKET = process.env.COS_BUCKET ?? 'demo-bucket';
  process.env.COS_REGION = process.env.COS_REGION ?? 'ap-demo';
  process.env.COS_ACCESS_KEY = process.env.COS_ACCESS_KEY ?? 'demo';
  process.env.COS_SECRET_KEY = process.env.COS_SECRET_KEY ?? 'demo';
  process.env.COS_INDEX_KEY = 'catalog/index.json';
  process.env.COS_LOCAL_PATH = '../specs/001-speckit-specify-wechat/contracts/theme-index.mock.json';
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER ?? 'qwen';
  process.env.LM_API_KEY = process.env.LM_API_KEY ?? 'demo';
  process.env.QWEN_API_KEY = process.env.QWEN_API_KEY ?? 'demo';
  process.env.QWEN_MOCK = 'true';
  process.env.LLM_MOCK = 'true';
  process.env.TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT ?? 'https://metrics.example.com';
  process.env.CATALOG_REFRESH_DISABLED = 'true';
});

describe('Stories contract', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });

  it('defines POST /stories request/response schema supporting continuing turns', async () => {
    const api = loadSchema('stories.openapi.json');
    const requestSchema = api.paths['/stories'].post.requestBody.content['application/json'].schema;
    const responseSchema = api.components.schemas.StoryTurnResponse;

    const validateRequest = ajv.compile(requestSchema);
    expect(validateRequest({ themeId: 'cyber-detective' })).toBe(true);

    const validateResponse = ajv.compile(responseSchema);
    const result = validateResponse({
      sessionId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
      turnIndex: 0,
      narrative: '欢迎来到故事',
      options: ['选项1', '选项2', '选项3', '选项4'],
      ending: false
    });
    expect(result).toBe(true);
  });

  it('allows ending responses without options but rejects invalid payload shape', () => {
    const api = loadSchema('stories.openapi.json');
    const responseSchema = api.components.schemas.StoryTurnResponse;
    const validateResponse = ajv.compile(responseSchema);

    expect(
      validateResponse({
        sessionId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        turnIndex: 3,
        narrative: '故事结束',
        ending: true
      })
    ).toBe(true);

    expect(
      validateResponse({
        sessionId: 'not-a-uuid',
        narrative: '缺少 turnIndex',
        ending: false
      })
    ).toBe(false);
  });

  it('validates selectedOption constraints on advanceStory request schema', () => {
    const api = loadSchema('stories.openapi.json');
    const requestSchema = api.paths['/stories/{sessionId}/turns'].post.requestBody.content['application/json'].schema;
    const validate = ajv.compile(requestSchema);

    expect(validate({ selectedOption: 2 })).toBe(true);
    expect(validate({ selectedOption: 4, customOptionText: '自定义内容' })).toBe(true);
    expect(validate({ selectedOption: 0 })).toBe(false);
    expect(validate({ selectedOption: 4, customOptionText: 'a'.repeat(101) })).toBe(false);
    expect(validate({})).toBe(false);
  });

  it('Fastify server boots with config dependencies satisfied', async () => {
    const app = buildServer();
    try {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
