import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signAccessToken: (payload: { sub: string }) => string;
    signRefreshToken: (payload: { sub: string }) => string;
    verifyRefreshToken: (token: string) => { sub: string };
    setRefreshCookie: (reply: FastifyReply, token: string) => void;
    clearRefreshCookie: (reply: FastifyReply) => void;
  }

  interface FastifyRequest {
    usuario?: { id: string };
  }
}

const REFRESH_COOKIE = 'peladafc_rt';

export const authPlugin = fp(async (app) => {
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });

  app.decorate('signAccessToken', (payload) =>
    jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    }),
  );

  app.decorate('signRefreshToken', (payload) =>
    jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
    }),
  );

  app.decorate('verifyRefreshToken', (token) => {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) {
      throw new Error('refresh token inválido');
    }
    return { sub: String(decoded.sub) };
  });

  app.decorate('setRefreshCookie', (reply, token) => {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
      path: '/v1/auth',
      signed: true,
    });
  });

  app.decorate('clearRefreshCookie', (reply) => {
    reply.clearCookie(REFRESH_COOKIE, {
      path: '/v1/auth',
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    });
  });

  app.decorate('authenticate', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ mensagem: 'Não autenticado' });
    }
    const token = auth.slice(7);
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
      if (typeof decoded === 'string' || !decoded.sub) {
        return reply.code(401).send({ mensagem: 'Token inválido' });
      }
      request.usuario = { id: String(decoded.sub) };
    } catch {
      return reply.code(401).send({ mensagem: 'Token inválido ou expirado' });
    }
  });
});

export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;
