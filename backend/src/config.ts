import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

export interface LlmProviderDefaults {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AppConfig {
  port: number;
  host: string;
  cos: {
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
    indexKey: string;
    localPath?: string;
  };
  llm: {
    provider: 'deepseek' | 'qwen';
    apiKey: string;
    mock: boolean;
    timeoutMs: number;
    maxRetries: number;
    deepseek: LlmProviderDefaults;
    qwen: LlmProviderDefaults;
  };
  telemetry: {
    endpoint: string;
    enabled: boolean;
  };
  wechat: {
    appId: string;
    appSecret: string;
    mock: boolean;
  };
  sessionTtlMinutes: number;
}

dotenv.config({
  path: process.env.CONFIG_PATH ?? path.resolve(process.cwd(), '.env')
});

const requireEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const parseBoolean = (value: string | undefined, defaultValue = false): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
};

export const loadConfig = (): AppConfig => {
  const resolveLocalCatalogPath = (): string | undefined => {
    const explicit = process.env.COS_LOCAL_PATH;
    if (explicit) {
      return explicit;
    }
    const candidates = [
      path.resolve(process.cwd(), 'catalog/index.generated.json'),
      path.resolve(process.cwd(), '../catalog/index.generated.json'),
      path.resolve(__dirname, '../../catalog/index.generated.json')
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  };

  const cosLocalPath = resolveLocalCatalogPath();

  const llmProviderEnv = (process.env.LLM_PROVIDER ?? 'qwen').toLowerCase();
  const provider: AppConfig['llm']['provider'] = llmProviderEnv === 'deepseek' ? 'deepseek' : 'qwen';

  const deepseekDefaults: LlmProviderDefaults = {
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY ?? process.env.LM_API_KEY ?? ''
  };

  const qwenDefaults: LlmProviderDefaults = {
    baseUrl: process.env.QWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_MODEL ?? 'qwen-flash',
    apiKey: process.env.QWEN_API_KEY ?? process.env.LM_API_KEY ?? ''
  };

  const mock = parseBoolean(
    process.env.LLM_MOCK ?? (provider === 'deepseek' ? process.env.DEEPSEEK_MOCK : process.env.QWEN_MOCK),
    false
  );

  const apiKey =
    process.env.LM_API_KEY ?? (provider === 'deepseek' ? deepseekDefaults.apiKey : qwenDefaults.apiKey) ?? '';

  if (!mock && !apiKey) {
    throw new Error('Missing environment variable: LM_API_KEY');
  }

  const timeoutMs = Number(
    process.env.LLM_TIMEOUT_MS ??
      (provider === 'deepseek' ? process.env.DEEPSEEK_TIMEOUT_MS : process.env.QWEN_TIMEOUT_MS) ??
      20000
  );

  const maxRetries = Number(
    process.env.LLM_MAX_RETRIES ??
      (provider === 'deepseek' ? process.env.DEEPSEEK_MAX_RETRIES : process.env.QWEN_MAX_RETRIES) ??
      1
  );

  const wechatMock = parseBoolean(process.env.WECHAT_MOCK, true);
  const wechatAppId = process.env.WECHAT_APP_ID ?? '';
  const wechatAppSecret = process.env.WECHAT_APP_SECRET ?? '';

  if (!wechatMock && (!wechatAppId || !wechatAppSecret)) {
    throw new Error('WECHAT_APP_ID and WECHAT_APP_SECRET are required when WECHAT_MOCK is false');
  }

  return {
    port: Number(process.env.PORT ?? 8080),
    host: process.env.HOST ?? '0.0.0.0',
    cos: {
      bucket: cosLocalPath ? process.env.COS_BUCKET ?? 'local-catalog' : requireEnv('COS_BUCKET'),
      region: cosLocalPath ? process.env.COS_REGION ?? 'local' : requireEnv('COS_REGION'),
      accessKey: cosLocalPath ? process.env.COS_ACCESS_KEY ?? 'local-access' : requireEnv('COS_ACCESS_KEY'),
      secretKey: cosLocalPath ? process.env.COS_SECRET_KEY ?? 'local-secret' : requireEnv('COS_SECRET_KEY'),
      indexKey: process.env.COS_INDEX_KEY ?? 'catalog/index.json',
      localPath: cosLocalPath
    },
    llm: {
      provider,
      apiKey,
      mock,
      timeoutMs,
      maxRetries,
      deepseek: deepseekDefaults,
      qwen: qwenDefaults
    },
    telemetry: {
      endpoint: requireEnv('TELEMETRY_ENDPOINT'),
      enabled: parseBoolean(process.env.TELEMETRY_ENABLED, true)
    },
    wechat: {
      appId: wechatAppId,
      appSecret: wechatAppSecret,
      mock: wechatMock
    },
    sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 30)
  };
};
