import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { gerarId } from '@peladafc/db';
import { erroResponseSchema } from '@peladafc/contracts';

const okSchema = z.object({ seguindo: z.boolean() });

export async function followsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Seguir/desseguir pelada --------------------------------------------
  typed.post(
    '/peladas/:peladaId/follow',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: { 200: okSchema, 401: erroResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.peladaId } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      await app.prisma.peladaFollow.upsert({
        where: { userId_peladaId: { userId, peladaId: pelada.id } },
        create: { id: gerarId(), userId, peladaId: pelada.id },
        update: {},
      });
      return { seguindo: true };
    },
  );

  typed.delete(
    '/peladas/:peladaId/follow',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: { 200: okSchema, 401: erroResponseSchema },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      await app.prisma.peladaFollow
        .delete({ where: { userId_peladaId: { userId, peladaId: req.params.peladaId } } })
        .catch(() => null);
      return { seguindo: false };
    },
  );

  // ---- Seguir/desseguir jogador -------------------------------------------
  typed.post(
    '/jogadores/:jogadorId/follow',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ jogadorId: z.string().uuid() }),
        response: { 200: okSchema, 401: erroResponseSchema, 404: erroResponseSchema },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({ where: { id: req.params.jogadorId } });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });
      await app.prisma.jogadorFollow.upsert({
        where: { userId_jogadorId: { userId, jogadorId: jogador.id } },
        create: { id: gerarId(), userId, jogadorId: jogador.id },
        update: {},
      });
      return { seguindo: true };
    },
  );

  typed.delete(
    '/jogadores/:jogadorId/follow',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ jogadorId: z.string().uuid() }),
        response: { 200: okSchema, 401: erroResponseSchema },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      await app.prisma.jogadorFollow
        .delete({ where: { userId_jogadorId: { userId, jogadorId: req.params.jogadorId } } })
        .catch(() => null);
      return { seguindo: false };
    },
  );

  // ---- Feed simples: peladas seguidas + últimas partidas ------------------
  const feedSchema = z.object({
    peladas: z.array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        nome: z.string(),
        ultimaPartida: z.coerce.date().nullable(),
      }),
    ),
  });

  typed.get(
    '/feed',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: feedSchema, 401: erroResponseSchema } },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const seguidas = await app.prisma.peladaFollow.findMany({
        where: { userId },
        include: {
          pelada: {
            include: {
              partidas: { orderBy: { data: 'desc' }, take: 1, select: { data: true } },
            },
          },
        },
      });
      return {
        peladas: seguidas.map((s) => ({
          id: s.pelada.id,
          slug: s.pelada.slug,
          nome: s.pelada.nome,
          ultimaPartida: s.pelada.partidas[0]?.data ?? null,
        })),
      };
    },
  );
}
