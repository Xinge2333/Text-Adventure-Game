import { FastifyInstance } from 'fastify';
import { getTelemetryClient } from '../telemetry/metrics';
import { hashSession } from '../services/deepseekProxy';
import { extractSessionToken } from '../utils/sessionToken';
import { userStore } from '../storage/userStore';

const telemetrySchema = {
  body: {
    type: 'object',
    required: ['themeId', 'turnIndex', 'latencyMs', 'outcome'],
    properties: {
      sessionId: { type: 'string' },
      sessionIdHash: { type: 'string' },
      themeId: { type: 'string' },
      turnIndex: { type: 'integer', minimum: 0 },
      latencyMs: { type: 'integer', minimum: 0 },
      outcome: {
        type: 'string',
        enum: ['success', 'handled_error', 'moderated']
      },
      timestamp: { type: 'string', format: 'date-time' }
    }
  }
};

export const telemetryRoutes = async (app: FastifyInstance) => {
  app.post('/telemetry/turns', { schema: telemetrySchema }, async (request, reply) => {
    const telemetryClient = getTelemetryClient();
    const {
      sessionId,
      sessionIdHash,
      themeId,
      turnIndex,
      latencyMs,
      outcome,
      timestamp
    } = request.body as {
      sessionId?: string;
      sessionIdHash?: string;
      themeId: string;
      turnIndex: number;
      latencyMs: number;
      outcome: 'success' | 'handled_error' | 'moderated';
      timestamp?: string;
    };

    const hashedSession = sessionIdHash ?? (sessionId ? hashSession(sessionId) : 'unknown');

    await telemetryClient.recordTurn({
      sessionIdHash: hashedSession,
      themeId,
      turnIndex,
      latencyMs,
      outcome,
      timestamp: timestamp ?? new Date().toISOString()
    });

    return reply.status(202).send({ accepted: true });
  });

  app.post('/telemetry/recommendations', async (request, reply) => {
    const telemetryClient = getTelemetryClient();
    const token = extractSessionToken(request);
    if (!token) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    const user = await userStore.getBySessionToken(token);
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const { themeId, action, recSetId, position, reason, timestamp } = request.body as {
      themeId: string;
      action: 'exposure' | 'click' | 'skip';
      recSetId?: string;
      position?: number;
      reason?: string;
      timestamp?: string;
    };

    if (!themeId || !action) {
      return reply.status(400).send({ message: 'themeId and action required' });
    }

    await telemetryClient.recordRecommendation({
      userIdHash: hashSession(user.userId),
      themeId,
      action,
      recSetId,
      position,
      reason,
      timestamp: timestamp ?? new Date().toISOString()
    });

    return reply.status(202).send({ accepted: true });
  });
};
