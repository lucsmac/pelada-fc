import { z } from 'zod';
import { peladaSchema, papelMembroSchema } from './pelada.js';
import { partidaSchema } from './partida.js';
import { candidaturaSchema } from './solicitacoes.js';

// ---------------------------------------------------------------------------
// Peladas do usuário logado

const peladaMinimaSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  nome: z.string(),
});

const localMinimoSchema = z.object({
  nome: z.string(),
  cidadeNome: z.string(),
  cidadeUf: z.string().length(2),
});

export const minhaPeladaSchema = z.object({
  pelada: peladaSchema,
  local: localMinimoSchema,
  papel: papelMembroSchema,
  proximaPartida: z.coerce.date().nullable(),
  totalMembros: z.number().int().nonnegative(),
});
export type MinhaPeladaDTO = z.infer<typeof minhaPeladaSchema>;

export const minhasPeladasResponseSchema = z.object({
  itens: z.array(minhaPeladaSchema),
  total: z.number().int().nonnegative(),
});
export type MinhasPeladasResponse = z.infer<typeof minhasPeladasResponseSchema>;

// ---------------------------------------------------------------------------
// Próxima / última partida do usuário

export const minhaPartidaSchema = partidaSchema.extend({
  pelada: peladaMinimaSchema,
  local: localMinimoSchema,
});
export type MinhaPartidaDTO = z.infer<typeof minhaPartidaSchema>;

export const minhaProximaPartidaResponseSchema = z.object({
  partida: minhaPartidaSchema.nullable(),
});
export type MinhaProximaPartidaResponse = z.infer<typeof minhaProximaPartidaResponseSchema>;

const destaquePartidaSchema = z.object({
  jogadorId: z.string().uuid(),
  nome: z.string(),
  avatarInicial: z.string().length(1),
  gols: z.number().int().nonnegative(),
  assistencias: z.number().int().nonnegative(),
  foiMvp: z.boolean(),
});

export const minhaUltimaPartidaSchema = minhaPartidaSchema.extend({
  destaques: z.array(destaquePartidaSchema),
});
export type MinhaUltimaPartidaDTO = z.infer<typeof minhaUltimaPartidaSchema>;

export const minhaUltimaPartidaResponseSchema = z.object({
  partida: minhaUltimaPartidaSchema.nullable(),
});
export type MinhaUltimaPartidaResponse = z.infer<typeof minhaUltimaPartidaResponseSchema>;

// ---------------------------------------------------------------------------
// Minhas candidaturas pendentes

export const minhaCandidaturaSchema = candidaturaSchema.extend({
  pelada: peladaMinimaSchema,
});
export type MinhaCandidaturaDTO = z.infer<typeof minhaCandidaturaSchema>;

export const minhasCandidaturasResponseSchema = z.object({
  itens: z.array(minhaCandidaturaSchema),
  total: z.number().int().nonnegative(),
});
export type MinhasCandidaturasResponse = z.infer<typeof minhasCandidaturasResponseSchema>;

// ---------------------------------------------------------------------------
// Estatísticas agregadas do usuário (todas as peladas, todas as temporadas)

export const minhasEstatisticasSchema = z.object({
  partidas: z.number().int().nonnegative(),
  gols: z.number().int().nonnegative(),
  assistencias: z.number().int().nonnegative(),
  vitorias: z.number().int().nonnegative(),
  empates: z.number().int().nonnegative(),
  derrotas: z.number().int().nonnegative(),
  mvps: z.number().int().nonnegative(),
  rating: z.number().int().min(0).max(99).nullable(),
});
export type MinhasEstatisticasDTO = z.infer<typeof minhasEstatisticasSchema>;

// ---------------------------------------------------------------------------
// Sugestões de peladas (públicas, cidade próxima, exclui as já membro)

export const sugestoesPeladasResponseSchema = z.object({
  itens: z.array(
    peladaSchema.extend({
      local: localMinimoSchema,
      totalMembros: z.number().int().nonnegative(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type SugestoesPeladasResponse = z.infer<typeof sugestoesPeladasResponseSchema>;
