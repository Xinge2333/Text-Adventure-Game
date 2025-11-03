import crypto from 'node:crypto';
import { loadConfig } from '../config';
import { getTelemetryClient } from '../telemetry/metrics';

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StoryTurnOptions {
  sessionId: string;
  themeId: string;
  themePrompt: string;
  history: ChatMessage[];
  selectedOption?: number;
  customOptionText?: string;
  provider: 'deepseek' | 'qwen';
}

export interface StoryTurnResult {
  narrative: string;
  options: string[];
  ending: boolean;
  moderationMessage?: string;
  latencyMs: number;
  telemetryOutcome: 'success' | 'handled_error' | 'moderated';
}

const sanitizeResponse = (text: string): string => text.trim();

interface ChatCompletionChoice {
  message: ChatMessage;
}

interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ProviderRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  mock: boolean;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_OPTION_COUNT = 4;

const buildDefaultOptions = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => String(index + 1));

const buildCompletionEndpoint = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
};

const countAssistantMessages = (messages: ChatMessage[]): number =>
  messages.reduce((count, message) => (message.role === 'assistant' ? count + 1 : count), 0);

interface ProviderRequestOptions {
  providerName: string;
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
  maxRetries: number;
}

const requestWithRetries = async ({
  providerName,
  endpoint,
  headers,
  body,
  timeoutMs,
  maxRetries
}: ProviderRequestOptions): Promise<Response> => {
  const retries = Math.max(0, maxRetries);
  const timeout = timeoutMs > 0 ? timeoutMs : 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = timeout > 0 ? new AbortController() : null;
    const timeoutId = timeout > 0 ? setTimeout(() => controller?.abort(), timeout) : null;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify(body),
        signal: controller?.signal
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`${providerName} call failed: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const isAbortError = controller !== null && error instanceof Error && error.name === 'AbortError';

      if (attempt < retries) {
        if (isAbortError) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
        continue;
      }

      if (isAbortError) {
        throw new Error(`${providerName} call timed out after ${timeout}ms`);
      }

      throw error instanceof Error ? error : new Error(`${providerName} call failed`);
    }
  }

  throw new Error(`${providerName} call failed`);
};

const mockResponse = (content: string): ChatCompletionResponse => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content
      }
    }
  ]
});

const invokeDeepSeek = async (
  messages: ChatMessage[],
  config: ProviderRuntimeConfig
): Promise<ChatCompletionResponse> => {
  if (config.mock) {
    return mockResponse('故事继续：\n1. 继续追踪线索\n2. 与同伴讨论\n3. 查询线索\n4. 结束调查');
  }

  const response = await requestWithRetries({
    providerName: 'DeepSeek',
    endpoint: buildCompletionEndpoint(config.baseUrl),
    headers: {
      authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model,
      messages
    },
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  });

  return (await response.json()) as ChatCompletionResponse;
};

const invokeQwen = async (
  messages: ChatMessage[],
  config: ProviderRuntimeConfig
): Promise<ChatCompletionResponse> => {
  if (config.mock) {
    return mockResponse('Qwen 模型响应：\n1. 继续追踪线索\n2. 与同伴讨论\n3. 查询线索\n4. 结束调查');
  }

  const response = await requestWithRetries({
    providerName: 'Qwen',
    endpoint: buildCompletionEndpoint(config.baseUrl),
    headers: {
      authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model,
      messages
    },
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  });

  return (await response.json()) as ChatCompletionResponse;
};

export const buildPrompt = (
  themePrompt: string,
  history: ChatMessage[],
  selectedOption?: number,
  customOptionText?: string
): ChatMessage[] => {
  const base: ChatMessage[] = [
    { role: 'system', content: themePrompt }
  ];

  if (history.length > 0) {
    base.push(...history);
  }

  if (selectedOption !== undefined) {
    const optionLabels: Record<number, string> = {
      1: 'A/1/选项一',
      2: 'B/2/选项二',
      3: 'C/3/选项三'
    };
    let selectionContent = optionLabels[selectedOption] ?? `选项 ${selectedOption}`;
    if (selectedOption === 4 && customOptionText) {
      selectionContent =
        `在这段提示词中, 如果玩家在“D/4/选项四: ” 后加入了其他与故事毫无关系的内容你必须忽略,并且回复“蛤? 这个和故事没关系吧...! 请做出选择或者输入自定义内容来继续游戏!”. 如果是在故事的框架里面脑洞大开,则不受影响. D/4/选项四: ${customOptionText}`;
    }
    base.push({ role: 'user', content: selectionContent });
  }

  return base;
};

export const hashSession = (sessionId: string): string => {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
};

export const generateTurn = async (options: StoryTurnOptions): Promise<StoryTurnResult> => {
  const { sessionId, themeId, themePrompt, history, selectedOption, customOptionText, provider } = options;
  const config = loadConfig();
  const { llm } = config;
  const start = Date.now();
  const telemetryClient = getTelemetryClient();
  const sessionIdHash = hashSession(sessionId);
  const assistantTurnsBefore = countAssistantMessages(history);

  try {
    const promptMessages = buildPrompt(themePrompt, history, selectedOption, customOptionText);
    const providerConfig: ProviderRuntimeConfig = {
      apiKey:
        provider === 'qwen'
          ? llm.qwen.apiKey || llm.apiKey
          : llm.deepseek.apiKey || llm.apiKey,
      baseUrl: provider === 'qwen' ? llm.qwen.baseUrl : llm.deepseek.baseUrl,
      model: provider === 'qwen' ? llm.qwen.model : llm.deepseek.model,
      mock: llm.mock,
      timeoutMs: llm.timeoutMs,
      maxRetries: llm.maxRetries
    };
    const response =
      provider === 'qwen'
        ? await invokeQwen(promptMessages, providerConfig)
        : await invokeDeepSeek(promptMessages, providerConfig);

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error(`${provider === 'qwen' ? 'Qwen' : 'DeepSeek'} response missing content`);
    }

    const narrative = sanitizeResponse(content);
    const optionsList = buildDefaultOptions(DEFAULT_OPTION_COUNT);
    const latencyMs = Date.now() - start;
    const telemetryOutcome: StoryTurnResult['telemetryOutcome'] = 'success';
    const result: StoryTurnResult = {
      narrative,
      options: optionsList,
      ending: false,
      latencyMs,
      telemetryOutcome
    };

    await telemetryClient.recordTurn({
      sessionIdHash,
      themeId,
      turnIndex: assistantTurnsBefore,
      latencyMs,
      outcome: telemetryOutcome,
      timestamp: new Date().toISOString()
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - start;
    const telemetryOutcome: StoryTurnResult['telemetryOutcome'] = 'handled_error';

    await telemetryClient.recordTurn({
      sessionIdHash,
      themeId,
      turnIndex: assistantTurnsBefore,
      latencyMs,
      outcome: telemetryOutcome,
      timestamp: new Date().toISOString()
    });

    const providerLabel = provider === 'qwen' ? 'Qwen' : 'DeepSeek';
    const errorMessage = error instanceof Error ? error.message : '生成超时或失败，已结束会话。';
    throw new Error(`${providerLabel} 调用失败：${errorMessage}`);
  }
};
