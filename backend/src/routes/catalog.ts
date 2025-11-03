import { FastifyInstance } from 'fastify';
import { getCatalogIndex } from '../services/themeIndex';

const matchesKeyword = (theme: any, keyword: string) => {
  const lower = keyword.toLowerCase();
  return (
    theme.title.toLowerCase().includes(lower) ||
    theme.description.toLowerCase().includes(lower) ||
    theme.tags.some((tag: string) => tag.toLowerCase().includes(lower))
  );
};

const withFavorites = (themes: any[], favorites: string[]): any[] => {
  const favoriteSet = new Set(favorites);
  return themes.map((theme) => ({
    ...theme,
    isFavorite: favoriteSet.has(theme.themeId)
  }));
};

export const catalogRoutes = async (app: FastifyInstance) => {
  app.get('/themes', async (request, reply) => {
    const { q, tag, favorites, clientVersion } = request.query as {
      q?: string;
      tag?: string;
      favorites?: string;
      clientVersion?: string;
    };

    const index = await getCatalogIndex();
    let themes = index.themes;

    if (clientVersion && clientVersion === index.catalogVersion) {
      return reply.status(304).send();
    }

    if (q) {
      themes = themes.filter((theme) => matchesKeyword(theme, q));
    }

    if (tag) {
      const lowerTag = tag.toLowerCase();
      themes = themes.filter((theme) => theme.tags.some((t: string) => t.toLowerCase() === lowerTag));
    }

    const favoritesList = favorites ? favorites.split(',') : [];

    return reply.send({
      catalogVersion: index.catalogVersion,
      themes: withFavorites(themes, favoritesList)
    });
  });
};
