import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  erroResponseSchema,
  estatisticasJogadorContextualSchema,
  estatisticasJogadorQuerySchema,
  rankingQuerySchema,
  rankingResponseSchema,
} from '@peladafc/contracts';
import { ordenarRanking } from '@peladafc/domain';
import { calcularRanking } from '../services/estatisticas.js';

export async function rankingsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Ranking geral (todas as peladas — perfis globais) -------------------
  typed.get(
    '/',
    {
      schema: {
        querystring: rankingQuerySchema,
        response: { 200: rankingResponseSchema },
      },
    },
    async (req) => {
      const linhas = await calcularRanking(app.prisma, {
        temporadaId: req.query.temporadaId,
      });
      const ordenadas = ordenarRanking(linhas, req.query.categoria);
      return {
        categoria: req.query.categoria,
        temporadaId: req.query.temporadaId ?? null,
        peladaId: null,
        linhas: ordenadas,
      };
    },
  );
}

export async function rankingsPorPeladaRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Ranking por pelada --------------------------------------------------
  typed.get(
    '/peladas/:peladaId/rankings',
    {
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        querystring: rankingQuerySchema,
        response: {
          200: rankingResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.peladaId } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });

      const linhas = await calcularRanking(app.prisma, {
        peladaId: pelada.id,
        temporadaId: req.query.temporadaId,
      });
      const ordenadas = ordenarRanking(linhas, req.query.categoria);
      return {
        categoria: req.query.categoria,
        temporadaId: req.query.temporadaId ?? null,
        peladaId: pelada.id,
        linhas: ordenadas,
      };
    },
  );

  // ---- Estatísticas do jogador (contextual ou global) ----------------------
  typed.get(
    '/jogadores/:jogadorId/estatisticas',
    {
      schema: {
        params: z.object({ jogadorId: z.string().uuid() }),
        querystring: estatisticasJogadorQuerySchema,
        response: {
          200: estatisticasJogadorContextualSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const jogador = await app.prisma.jogador.findUnique({ where: { id: req.params.jogadorId } });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });

      const linhas = await calcularRanking(app.prisma, { peladaId: req.query.peladaId });
      const linha = linhas.find((l) => l.jogadorId === jogador.id);
      return {
        jogadorId: jogador.id,
        peladaId: req.query.peladaId ?? null,
        estatisticas: linha?.estatisticas ?? {
          partidas: 0,
          gols: 0,
          assistencias: 0,
          vitorias: 0,
          empates: 0,
          derrotas: 0,
          mvps: 0,
        },
      };
    },
  );
}
