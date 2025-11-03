import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FavoriteTheme, toPublicUser, userStore } from '../storage/userStore';
import { behaviorStore } from '../storage/behaviorStore';
import { interestVectorService } from '../services/interestVector';
import { extractSessionToken } from '../utils/sessionToken';

const favoritesSchema = {
  body: {
    type: 'object',
    required: ['favorites'],
    properties: {
      favorites: {
        type: 'array',
        items: {
          type: 'object',
          required: ['themeId'],
          properties: {
            themeId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' }
          }
        }
      }
    }
  }
};

const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = extractSessionToken(request);
  if (!token) {
    await reply.status(401).send({ message: 'Unauthorized' });
    return null;
  }
  const user = await userStore.getBySessionToken(token);
  if (!user) {
    await reply.status(401).send({ message: 'Unauthorized' });
    return null;
  }
  return { token, user };
};

export const userRoutes = async (app: FastifyInstance) => {
  app.get('/me', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) {
      return;
    }
    return reply.send({ user: toPublicUser(auth.user) });
  });

  app.put('/me/favorites', { schema: favoritesSchema }, async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) {
      return;
    }

    const { favorites } = request.body as { favorites: FavoriteTheme[] };
    if (!Array.isArray(favorites)) {
      return reply.status(400).send({ message: 'favorites must be an array' });
    }

    const previousFavorites = auth.user.favorites ?? [];
    const updated = await userStore.updateFavorites(auth.user.userId, favorites);

    const prevIds = new Set(previousFavorites.map((fav) => fav.themeId));
    const nextIds = new Set(updated.favorites.map((fav) => fav.themeId));
    const added: string[] = [];
    const removed: string[] = [];

    for (const id of nextIds) {
      if (!prevIds.has(id)) {
        added.push(id);
      }
    }
    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        removed.push(id);
      }
    }

    if (added.length || removed.length) {
      await behaviorStore.recordFavoritesDiff(added, removed);
      await Promise.all(
        added.map((themeId) =>
          interestVectorService.applyFavoriteAddition({
            userId: auth.user.userId,
            themeId
          })
        )
      );
    }

    return reply.send({ favorites: updated.favorites });
  });
};
