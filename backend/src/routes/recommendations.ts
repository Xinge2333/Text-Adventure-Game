import { FastifyInstance } from 'fastify';
import { extractSessionToken } from '../utils/sessionToken';
import { userStore } from '../storage/userStore';
import { getRecommendations } from '../services/recommendations';
import { behaviorStore } from '../storage/behaviorStore';
import { randomUUID } from 'node:crypto';
import { getTelemetryClient } from '../telemetry/metrics';
import { hashSession } from '../services/deepseekProxy';
import { interestVectorService } from '../services/interestVector';

export const recommendationRoutes = async (app: FastifyInstance) => {
  app.get('/recommendations', async (request, reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    const user = await userStore.getBySessionToken(token);
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const limit = Math.min(10, Number((request.query as { limit?: string })?.limit ?? 5));
    const recommendations = await getRecommendations(user.userId, limit);
    const recSetId = randomUUID();

    return reply.send({
      recSetId,
      items: recommendations.map((entry, index) => ({
        themeId: entry.theme.themeId,
        title: entry.theme.title,
        description: entry.theme.description,
        tags: entry.theme.tags,
        reason: entry.reason,
        score: Number(entry.score.toFixed(4)),
        position: index
      }))
    });
  });

  app.post('/recommendations/skip', async (request, reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    const user = await userStore.getBySessionToken(token);
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const telemetryClient = getTelemetryClient();

    const { themeId, recSetId, position, reason, turnCount } = request.body as {
      themeId?: string;
      recSetId?: string;
      position?: number;
      reason?: string;
      turnCount?: number;
    };
    if (!themeId) {
      return reply.status(400).send({ message: 'themeId required' });
    }

    await behaviorStore.recordSkip(user.userId, themeId, typeof turnCount === 'number' ? turnCount : 0);
    await interestVectorService.applySkip({
      userId: user.userId,
      themeId,
      turnCount: typeof turnCount === 'number' ? turnCount : 0
    });
    await telemetryClient.recordRecommendation({
      userIdHash: hashSession(user.userId),
      themeId,
      action: 'skip',
      recSetId,
      position,
      reason,
      timestamp: new Date().toISOString()
    });
    return reply.status(202).send({ recorded: true });
  });
};
