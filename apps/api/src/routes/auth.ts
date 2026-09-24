import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import argon2 from 'argon2';
import {
  authResponseSchema,
  erroResponseSchema,
  loginBodySchema,
  meResponseSchema,
  signupBodySchema,
  type AuthUser,
} from '@peladafc/contracts';
import { gerarId } from '@peladafc/db';
import { REFRESH_COOKIE_NAME } from '../plugins/auth.js';

const authUserFromDb = (
  u: {
    id: string;
    telefone: string;
    email: string | null;
    nome: string;
    jogador: { id: string } | null;
  },
  extras: { reivindicou?: boolean } = {},
): AuthUser => ({
  id: u.id,
  nome: u.nome,
  telefone: u.telefone,
  email: u.email,
  jogadorId: u.jogador?.id ?? null,
  ...(extras.reivindicou ? { reivindicou: true } : {}),
});

export async function authRoutes(app: FastifyInstance) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // ---- Signup ---------------------------------------------------------------
  typedApp.post(
    '/signup',
    {
      schema: {
        body: signupBodySchema,
        response: {
          201: authResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { nome, telefone, senha } = request.body;
      const nomeLimpo = nome.trim();

      const [userExistente, jogadorOrfao, jogadorComDono] = await Promise.all([
        app.prisma.user.findUnique({ where: { telefone } }),
        app.prisma.jogador.findFirst({ where: { telefone, userId: null } }),
        app.prisma.jogador.findFirst({ where: { telefone, userId: { not: null } } }),
      ]);

      if (userExistente) {
        return reply.code(409).send({ mensagem: 'Telefone já cadastrado' });
      }
      if (jogadorComDono) {
        return reply.code(409).send({ mensagem: 'Telefone já vinculado a outra conta' });
      }

      const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
      const userId = gerarId();
      const avatarInicial = nomeLimpo[0]!.toUpperCase();
      const reivindicou = jogadorOrfao !== null;

      const user = reivindicou
        ? await app.prisma.user.create({
            data: {
              id: userId,
              telefone,
              senhaHash,
              nome: nomeLimpo,
              jogador: { connect: { id: jogadorOrfao.id } },
            },
            include: { jogador: { select: { id: true } } },
          })
        : await app.prisma.user.create({
            data: {
              id: userId,
              telefone,
              senhaHash,
              nome: nomeLimpo,
              jogador: {
                create: {
                  id: gerarId(),
                  nome: nomeLimpo,
                  avatarInicial,
                  telefone,
                },
              },
            },
            include: { jogador: { select: { id: true } } },
          });

      const accessToken = app.signAccessToken({ sub: user.id });
      const refreshToken = app.signRefreshToken({ sub: user.id });
      app.setRefreshCookie(reply, refreshToken);

      return reply.code(201).send({
        usuario: authUserFromDb(user, { reivindicou }),
        accessToken,
      });
    },
  );

  // ---- Login ----------------------------------------------------------------
  typedApp.post(
    '/login',
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { telefone, senha } = request.body;
      const user = await app.prisma.user.findUnique({
        where: { telefone },
        include: { jogador: { select: { id: true } } },
      });

      if (!user || !(await argon2.verify(user.senhaHash, senha))) {
        return reply.code(401).send({ mensagem: 'Credenciais inválidas' });
      }

      const accessToken = app.signAccessToken({ sub: user.id });
      const refreshToken = app.signRefreshToken({ sub: user.id });
      app.setRefreshCookie(reply, refreshToken);

      return reply.send({
        usuario: authUserFromDb(user),
        accessToken,
      });
    },
  );

  // ---- Refresh --------------------------------------------------------------
  typedApp.post(
    '/refresh',
    {
      schema: {
        response: {
          200: z.object({ accessToken: z.string() }),
          401: erroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const cookieBruto = request.cookies[REFRESH_COOKIE_NAME];
      if (!cookieBruto) {
        return reply.code(401).send({ mensagem: 'Sem refresh token' });
      }
      const unsigned = request.unsignCookie(cookieBruto);
      if (!unsigned.valid || !unsigned.value) {
        return reply.code(401).send({ mensagem: 'Refresh token inválido' });
      }

      try {
        const { sub } = app.verifyRefreshToken(unsigned.value);
        const accessToken = app.signAccessToken({ sub });
        // Rotação de refresh
        const novoRefresh = app.signRefreshToken({ sub });
        app.setRefreshCookie(reply, novoRefresh);
        return reply.send({ accessToken });
      } catch {
        return reply.code(401).send({ mensagem: 'Refresh token expirado' });
      }
    },
  );

  // ---- Logout ---------------------------------------------------------------
  typedApp.post('/logout', async (_request, reply) => {
    app.clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  // ---- Me -------------------------------------------------------------------
  typedApp.get(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: meResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.usuario!.id;
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        include: { jogador: { select: { id: true } } },
      });
      if (!user) {
        return reply.code(404).send({ mensagem: 'Usuário não encontrado' });
      }
      return reply.send({ usuario: authUserFromDb(user) });
    },
  );
}
