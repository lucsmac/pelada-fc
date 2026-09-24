import { z } from 'zod';
import { funcaoPartidaSchema, posicaoLinhaSchema } from './partida.js';

export const estatisticasJogadorSchema = z.object({
  partidas: z.number().int().nonnegative(),
  gols: z.number().int().nonnegative(),
  assistencias: z.number().int().nonnegative(),
  vitorias: z.number().int().nonnegative(),
  empates: z.number().int().nonnegative(),
  derrotas: z.number().int().nonnegative(),
  mvps: z.number().int().nonnegative(),
});
export type EstatisticasJogadorDTO = z.infer<typeof estatisticasJogadorSchema>;

export const privacidadeJogadorSchema = z.object({
  perfilPublico: z.boolean(),
  mostrarEstatisticas: z.boolean(),
  mostrarPeladas: z.boolean(),
  mostrarHistorico: z.boolean(),
  mostrarCalendarioPublico: z.boolean(),
});
export type PrivacidadeJogador = z.infer<typeof privacidadeJogadorSchema>;

export const jogadorSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  nome: z.string().min(1),
  apelido: z.string().nullable(),
  avatarInicial: z.string().length(1),
  cidadeAtual: z.string().nullable(),
  funcaoPreferida: funcaoPartidaSchema.nullable(),
  posicaoLinha: posicaoLinhaSchema.nullable(),
  telefone: z.string().nullable(),
  criadoEm: z.coerce.date(),
});
export type JogadorDTO = z.infer<typeof jogadorSchema>;

export const editarJogadorBodySchema = z
  .object({
    nome: z.string().min(2).max(80).optional(),
    apelido: z.string().max(40).nullable().optional(),
    cidadeAtual: z.string().max(80).nullable().optional(),
    funcaoPreferida: funcaoPartidaSchema.nullable().optional(),
    posicaoLinha: posicaoLinhaSchema.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.funcaoPreferida === 'goleiro' && val.posicaoLinha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['posicaoLinha'],
        message: 'Goleiro não escolhe posição de linha',
      });
    }
  });
export type EditarJogadorBody = z.infer<typeof editarJogadorBodySchema>;

export const editarPrivacidadeBodySchema = privacidadeJogadorSchema.partial();
export type EditarPrivacidadeBody = z.infer<typeof editarPrivacidadeBodySchema>;

// Perfil retornado — quando o visualizador não pode ver algo, o campo é omitido/null.
export const perfilJogadorResponseSchema = z.object({
  jogador: jogadorSchema,
  privacidade: privacidadeJogadorSchema.nullable(), // só o dono vê
  carreira: estatisticasJogadorSchema.nullable(),
  rating: z.number().int().min(0).max(99).nullable(),
  peladas: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        nome: z.string(),
        papel: z.enum(['admin', 'membro']),
      }),
    )
    .nullable(),
});
export type PerfilJogadorResponse = z.infer<typeof perfilJogadorResponseSchema>;

// Busca de jogadores por nome — usada pelo picker de convidados.
export const buscarJogadoresQuerySchema = z.object({
  q: z.string().min(1).max(80),
  limite: z.coerce.number().int().positive().max(50).default(10),
  excluirPeladaId: z.string().uuid().optional(),
});
export type BuscarJogadoresQuery = z.infer<typeof buscarJogadoresQuerySchema>;

export const buscarJogadoresResponseSchema = z.object({
  itens: z.array(
    z.object({
      id: z.string().uuid(),
      nome: z.string(),
      apelido: z.string().nullable(),
      avatarInicial: z.string().length(1),
      cidadeAtual: z.string().nullable(),
    }),
  ),
});
export type BuscarJogadoresResponse = z.infer<typeof buscarJogadoresResponseSchema>;

// Calendário — dias que o jogador tem partida (fixo, convidado ou presença).
export const calendarioItemSchema = z.object({
  partidaId: z.string().uuid(),
  data: z.coerce.date(),
  status: z.enum(['agendada', 'em_andamento', 'finalizada', 'cancelada']),
  papel: z.enum(['membro', 'convidado', 'presenca']),
  pelada: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    nome: z.string(),
    modalidade: z.string(),
  }),
});
export type CalendarioItemDTO = z.infer<typeof calendarioItemSchema>;

export const calendarioQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});
export type CalendarioQuery = z.infer<typeof calendarioQuerySchema>;

export const calendarioResponseSchema = z.object({
  itens: z.array(calendarioItemSchema),
});
export type CalendarioResponse = z.infer<typeof calendarioResponseSchema>;
