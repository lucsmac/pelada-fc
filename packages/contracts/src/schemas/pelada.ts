import { z } from 'zod';
import { DIAS_SEMANA, MODALIDADES } from '@peladafc/domain';
import { telefoneSchema } from './auth.js';
import { funcaoPartidaSchema, posicaoLinhaSchema } from './partida.js';

export { DIAS_SEMANA };

const HORARIO_REGEX = /^\d{2}:\d{2}$/;
const SLUG_REGEX = /^[a-z0-9-]+$/;

export const peladaSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().nullable(),
  modalidade: z.enum(MODALIDADES),
  localId: z.string().uuid(),
  diaSemana: z.enum(DIAS_SEMANA),
  horario: z.string().regex(HORARIO_REGEX, 'formato HH:mm'),
  // Config estruturada dos times por partida.
  quantidadeTimes: z.number().int().positive(),
  jogadoresPorTime: z.number().int().positive(),
  goleirosPorTime: z.number().int().nonnegative(),
  tamanhoReserva: z.number().int().nonnegative(),
  goleirosPagam: z.boolean(),
  // Derivados (computados no server pra evitar duplicar conta no cliente):
  //   totalJogadores = quantidadeTimes × jogadoresPorTime
  //   maxGoleiros    = quantidadeTimes × goleirosPorTime
  totalJogadores: z.number().int().nonnegative(),
  maxGoleiros: z.number().int().nonnegative(),
  limiteMembros: z.number().int().positive().nullable(),
  abertaParaNovos: z.boolean(),
  publica: z.boolean(),
  aprovacaoObrigatoria: z.boolean(),
  criadoPorUserId: z.string().uuid(),
  temporadaAtualId: z.string().uuid().nullable(),
  tokenConvitePublico: z.string().nullable(),
  convidadosPagamCustos: z.boolean(),
  criadoEm: z.coerce.date(),
  // Derivados de CustoRecorrente (opcionais — nem todo endpoint calcula).
  // Estimado usando totalJogadores como divisor da parte rateada.
  precoEstimadoCentavos: z.number().int().nonnegative().optional(),
  precoTemRateado: z.boolean().optional(),
});
export type PeladaDTO = z.infer<typeof peladaSchema>;

const peladaBaseSchema = z.object({
  slug: z.string().min(3).max(60).regex(SLUG_REGEX, 'apenas letras minúsculas, números e hífens'),
  nome: z.string().min(2).max(100),
  descricao: z.string().max(500).optional(),
  modalidade: z.enum(MODALIDADES),
  localId: z.string().uuid(),
  diaSemana: z.enum(DIAS_SEMANA),
  horario: z.string().regex(HORARIO_REGEX),
  quantidadeTimes: z.number().int().min(2).max(8).default(2),
  jogadoresPorTime: z.number().int().min(3).max(15).default(7),
  goleirosPorTime: z.number().int().min(0).max(3).default(1),
  tamanhoReserva: z.number().int().min(0).max(30).default(4),
  goleirosPagam: z.boolean().default(true),
  limiteMembros: z.number().int().min(1).max(500).optional(),
  publica: z.boolean().default(false),
  abertaParaNovos: z.boolean().default(true),
  aprovacaoObrigatoria: z.boolean().default(true),
  convidadosPagamCustos: z.boolean().default(true),
});

function refinarConfigTimes(
  val: {
    quantidadeTimes?: number;
    jogadoresPorTime?: number;
    goleirosPorTime?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (
    val.goleirosPorTime !== undefined &&
    val.jogadoresPorTime !== undefined &&
    val.goleirosPorTime >= val.jogadoresPorTime
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['goleirosPorTime'],
      message: 'Deve ser menor que jogadores por time (jogadores inclui goleiro)',
    });
  }
}

export const criarPeladaBodySchema = peladaBaseSchema.superRefine(refinarConfigTimes);
export type CriarPeladaBody = z.infer<typeof criarPeladaBodySchema>;

export const editarPeladaBodySchema = peladaBaseSchema
  .partial()
  .omit({ slug: true })
  .superRefine(refinarConfigTimes);
export type EditarPeladaBody = z.infer<typeof editarPeladaBodySchema>;

// GET /peladas — filtros
export const listarPeladasQuerySchema = z.object({
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
  modalidade: z.enum(MODALIDADES).optional(),
  diaSemana: z.enum(DIAS_SEMANA).optional(),
  abertaParaNovos: z.coerce.boolean().optional(),
  busca: z.string().optional(),
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().positive().max(50).default(12),
});
export type ListarPeladasQuery = z.infer<typeof listarPeladasQuerySchema>;

export const listarPeladasResponseSchema = z.object({
  itens: z.array(peladaSchema),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  porPagina: z.number().int().positive(),
});
export type ListarPeladasResponse = z.infer<typeof listarPeladasResponseSchema>;

// Membros ---------------------------------------------------------------

export const PAPEIS_MEMBRO = ['admin', 'membro'] as const;
export const papelMembroSchema = z.enum(PAPEIS_MEMBRO);
export type PapelMembro = z.infer<typeof papelMembroSchema>;

export const membroSchema = z.object({
  id: z.string().uuid(),
  jogadorId: z.string().uuid(),
  papel: papelMembroSchema,
  entrouEm: z.coerce.date(),
  jogador: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    apelido: z.string().nullable(),
    avatarInicial: z.string().length(1),
    telefone: z.string().nullable(),
    userId: z.string().uuid().nullable(),
    funcaoPreferida: funcaoPartidaSchema.nullable(),
    posicaoLinha: posicaoLinhaSchema.nullable(),
  }),
});
export type MembroDTO = z.infer<typeof membroSchema>;

export const listarMembrosResponseSchema = z.object({
  itens: z.array(membroSchema),
  total: z.number().int().nonnegative(),
});
export type ListarMembrosResponse = z.infer<typeof listarMembrosResponseSchema>;

// Duas formas de adicionar membro:
// 1) Jogador já existente (jogadorId)
// 2) Cadastro simples (nome + telefone opcional) — cria Jogador sem User.
export const adicionarMembroBodySchema = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('existente'),
    jogadorId: z.string().uuid(),
    papel: papelMembroSchema.default('membro'),
  }),
  z.object({
    modo: z.literal('novo'),
    nome: z.string().min(2).max(80),
    telefone: telefoneSchema.optional(),
    papel: papelMembroSchema.default('membro'),
  }),
]);
export type AdicionarMembroBody = z.infer<typeof adicionarMembroBodySchema>;
