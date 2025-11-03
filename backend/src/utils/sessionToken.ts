import { FastifyRequest } from 'fastify';

export const extractSessionToken = (request: FastifyRequest): string | null => {
  const header = request.headers['x-session-token'];
  if (typeof header === 'string' && header) {
    return header;
  }
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
};
