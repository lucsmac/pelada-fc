import { z } from 'zod';
import { CATEGORIAS_RANKING } from '@peladafc/domain';
import { estatisticasJogadorSchema } from './jogador.js';

export const rankingQuerySchema = z.object({
  temporadaId: z.string().uuid().optional(),
  categoria: z.enum(CATEGORIAS_RANKING).default('geral'),
});
export type RankingQuery = z.infer<typeof rankingQuerySchema>;

export const linhaRankingSchema = z.object({
  posicao: z.number().int().positive(),
  jogadorId: z.string().uuid(),
  nome: z.string(),
  avatarInicial: z.string().length(1),
  valor: z.number(),
  estatisticas: estatisticasJogadorSchema,
});
export type LinhaRankingDTO = z.infer<typeof linhaRankingSchema>;

export const rankingResponseSchema = z.object({
  categoria: z.enum(CATEGORIAS_RANKING),
  temporadaId: z.string().uuid().nullable(),
  peladaId: z.string().uuid().nullable(),
  linhas: z.array(linhaRankingSchema),
});
export type RankingResponse = z.infer<typeof rankingResponseSchema>;

// Estatísticas do jogador — global ou contextual a uma pelada
export const estatisticasJogadorQuerySchema = z.object({
  peladaId: z.string().uuid().optional(),
});
export const estatisticasJogadorContextualSchema = z.object({
  jogadorId: z.string().uuid(),
  peladaId: z.string().uuid().nullable(),
  estatisticas: estatisticasJogadorSchema,
});
export type EstatisticasJogadorContextual = z.infer<typeof estatisticasJogadorContextualSchema>;
