import { FastifyInstance } from 'fastify';
import { exchangeCodeForSession } from '../services/wxAuth';
import { toPublicUser, userStore } from '../storage/userStore';
import { extractSessionToken } from '../utils/sessionToken';

const loginSchema = {
  body: {
    type: 'object',
    required: ['code'],
    properties: {
      code: { type: 'string', minLength: 1 },
      nickName: { type: 'string' },
      avatarUrl: { type: 'string' }
    }
  }
};

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/auth/login', { schema: loginSchema }, async (request, reply) => {
    const { code, nickName, avatarUrl } = request.body as {
      code: string;
      nickName?: string;
      avatarUrl?: string;
    };

    const { openId } = await exchangeCodeForSession(code);
    const user = await userStore.findOrCreateByOpenId(openId, { nickName, avatarUrl });
    const sessionToken = await userStore.issueSession(user.userId);

    return reply.send({
      sessionToken,
      user: toPublicUser(user)
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    await userStore.revokeSession(token);
    return reply.send({ loggedOut: true });
  });
};
