import { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getCatalogIndex } from '../services/themeIndex';
import { generateTurn } from '../services/deepseekProxy';
import { loadConfig } from '../config';
import type { StoryTurnOptions } from '../services/deepseekProxy';
import { storage } from '../storage/cosStorage';
import { extractSessionToken } from '../utils/sessionToken';
import { userStore } from '../storage/userStore';
import { behaviorStore } from '../storage/behaviorStore';
import { interestVectorService } from '../services/interestVector';

type SessionMessage = Required<StoryTurnOptions>['history'][number];

type SupportedProvider = 'deepseek' | 'qwen';

interface SessionState {
  themeId: string;
  themePrompt: string;
  history: SessionMessage[];
  provider: SupportedProvider;
  tags: string[];
}

const sessions = new Map<string, SessionState>();

const resolveUserId = async (request: FastifyRequest): Promise<string | null> => {
  const token = extractSessionToken(request);
  if (!token) {
    return null;
  }
  const user = await userStore.getBySessionToken(token);
  return user?.userId ?? null;
};

const createSession = (
  themeId: string,
  themePrompt: string,
  provider: SupportedProvider,
  tags: string[]
): string => {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    themeId,
    themePrompt,
    history: [],
    provider,
    tags
  });
  return sessionId;
};

export const storiesRoutes = async (app: FastifyInstance) => {
  app.post('/stories', async (request, reply) => {
    const { themeId, modelProvider } = request.body as {
      themeId: string;
      modelProvider?: string;
    };

    if (!themeId) {
      return reply.status(400).send({ message: 'themeId required' });
    }

    const index = await getCatalogIndex();
    const theme = index.themes.find((t) => t.themeId === themeId);

    if (!theme) {
      return reply.status(400).send({ message: 'Theme not found' });
    }

    const prompt = await storage.fetchThemePrompt(theme.promptPath);

    const config = loadConfig();
    const requestedProvider = typeof modelProvider === 'string' ? modelProvider.toLowerCase() : '';
    let provider: SupportedProvider = config.llm.provider;
    if (requestedProvider === 'qwen' || requestedProvider === 'deepseek') {
      provider = requestedProvider;
    }

    if (!config.llm.mock) {
      const providerKey =
        provider === 'qwen'
          ? config.llm.qwen.apiKey || config.llm.apiKey
          : config.llm.deepseek.apiKey || config.llm.apiKey;
      if (!providerKey) {
        return reply.status(400).send({ message: `Model provider ${provider} unavailable` });
      }
    }

    const tags = (theme.tags ?? []).map((tag) => tag.toLowerCase());
    const sessionId = createSession(themeId, prompt, provider, tags);

    try {
      const turn = await generateTurn({
        sessionId,
        themeId,
        themePrompt: prompt,
        history: [],
        provider
      });

      sessions.get(sessionId)?.history.push({ role: 'assistant', content: turn.narrative });

      const userId = await resolveUserId(request);
      if (userId) {
        await behaviorStore.recordPlay(userId, themeId);
      }

      return {
        sessionId,
        turnIndex: 0,
        narrative: turn.narrative,
        options: turn.options,
        ending: turn.ending,
        latencyMs: turn.latencyMs
      };
    } catch (error) {
      sessions.delete(sessionId);
      request.log.error({ err: error }, 'initial-turn-generation-failed');
      throw error;
    }
  });

  app.post('/stories/:sessionId/turns', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { selectedOption, customOptionText } = request.body as {
      selectedOption: number;
      customOptionText?: string;
    };

    const session = sessions.get(sessionId);
    if (!session) {
      return reply.status(400).send({ message: 'Session expired or invalid' });
    }

    if (!selectedOption || selectedOption < 1 || selectedOption > 4) {
      return reply.status(400).send({ message: 'selectedOption must be between 1 and 4' });
    }

    const normalizedCustomText =
      typeof customOptionText === 'string' ? customOptionText.trim() : '';

    if (selectedOption === 4) {
      if (!normalizedCustomText) {
        return reply
          .status(400)
          .send({ message: 'customOptionText is required when selecting option 4' });
      }

      const words = normalizedCustomText.split(/\s+/).filter(Boolean);
      const charCount = Array.from(normalizedCustomText).length;
      if (words.length > 100 || charCount > 100) {
        return reply
          .status(400)
          .send({ message: 'customOptionText must be 100 words or fewer' });
      }
    } else if (normalizedCustomText) {
      return reply.status(400).send({ message: 'customOptionText allowed only with option 4' });
    }

    const option4Prefix =
      '在这段提示词中, 如果玩家在“D/4/选项四: ” 后加入了其他与故事毫无关系的内容你必须忽略,并且回复“蛤? 这个和故事没关系吧...! 请做出选择或者输入自定义内容来继续游戏!”. 如果是在故事的框架里面脑洞大开,则不受影响. D/4/选项四: ';
    const userSelectionSummary =
      selectedOption === 4 && normalizedCustomText
        ? `${option4Prefix}${normalizedCustomText}`
        : `玩家选择了选项 ${selectedOption}`;

    const userMessage = { role: 'user', content: userSelectionSummary } as SessionMessage;
    session.history.push(userMessage);

    try {
      const assistantTurnsBefore = session.history.filter((message) => message.role === 'assistant').length;
      const turn = await generateTurn({
        sessionId,
        themeId: session.themeId,
        themePrompt: session.themePrompt,
        history: session.history,
        selectedOption,
        customOptionText: selectedOption === 4 ? normalizedCustomText : undefined,
        provider: session.provider
      });

      session.history.push({ role: 'assistant', content: turn.narrative });

      const currentTurnIndex = assistantTurnsBefore;

      const userId = await resolveUserId(request);
      if (userId) {
        const { previousOptionClicks, optionClicks, previousMaxTurnDepth, maxTurnDepth } = await behaviorStore.recordOption(
          userId,
          session.themeId,
          currentTurnIndex + 1
        );

        await interestVectorService.applyOptionInteraction({
          userId,
          themeId: session.themeId,
          tags: session.tags,
          previousOptionClicks,
          optionClicks,
          previousMaxTurnDepth,
          maxTurnDepth,
          completed: turn.ending
        });

        if (turn.ending) {
          await behaviorStore.recordPlay(userId, session.themeId);
        }
      }

      if (turn.ending) {
        sessions.delete(sessionId);
      }

      return {
        sessionId,
        turnIndex: currentTurnIndex,
        narrative: turn.narrative,
        options: turn.options,
        ending: turn.ending,
        moderationMessage: turn.moderationMessage,
        latencyMs: turn.latencyMs,
        outcome: turn.telemetryOutcome
      };
    } catch (error) {
      session.history.pop();
      request.log.error({ err: error }, 'turn-generation-failed');
      throw error;
    }
  });
};
