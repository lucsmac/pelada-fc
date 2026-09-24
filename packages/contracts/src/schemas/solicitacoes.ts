import { z } from 'zod';

export const STATUS_SOLICITACAO = [
  'pendente',
  'aceito',
  'recusado',
  'cancelado',
  'expirado',
] as const;
export const statusSolicitacaoSchema = z.enum(STATUS_SOLICITACAO);
export type StatusSolicitacao = z.infer<typeof statusSolicitacaoSchema>;

// ---------------------------------------------------------------------------
// Candidatura

export const candidaturaSchema = z.object({
  id: z.string().uuid(),
  peladaId: z.string().uuid(),
  userId: z.string().uuid(),
  mensagem: z.string().nullable(),
  status: statusSolicitacaoSchema,
  criadoEm: z.coerce.date(),
  respondidoEm: z.coerce.date().nullable(),
  user: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    telefone: z.string(),
    email: z.string().email().nullable(),
  }),
});
export type CandidaturaDTO = z.infer<typeof candidaturaSchema>;

export const criarCandidaturaBodySchema = z.object({
  mensagem: z.string().max(500).optional(),
});
export type CriarCandidaturaBody = z.infer<typeof criarCandidaturaBodySchema>;

export const listarCandidaturasResponseSchema = z.object({
  itens: z.array(candidaturaSchema),
  total: z.number().int().nonnegative(),
});
export type ListarCandidaturasResponse = z.infer<typeof listarCandidaturasResponseSchema>;

// ---------------------------------------------------------------------------
// Convite

export const conviteSchema = z.object({
  id: z.string().uuid(),
  peladaId: z.string().uuid(),
  jogadorId: z.string().uuid(),
  status: statusSolicitacaoSchema,
  expiraEm: z.coerce.date().nullable(),
  criadoEm: z.coerce.date(),
  respondidoEm: z.coerce.date().nullable(),
  jogador: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    avatarInicial: z.string().length(1),
    userId: z.string().uuid().nullable(),
  }),
  pelada: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      nome: z.string(),
    })
    .optional(),
});
export type ConviteDTO = z.infer<typeof conviteSchema>;

export const criarConviteBodySchema = z.object({
  jogadorId: z.string().uuid(),
  expiraEm: z.coerce.date().optional(),
});
export type CriarConviteBody = z.infer<typeof criarConviteBodySchema>;

export const listarConvitesResponseSchema = z.object({
  itens: z.array(conviteSchema),
  total: z.number().int().nonnegative(),
});
export type ListarConvitesResponse = z.infer<typeof listarConvitesResponseSchema>;

// ---------------------------------------------------------------------------
// Convite público por link (1 token por pelada, sem expiração).

export const linkConvitePublicoSchema = z.object({
  token: z.string().min(8),
});
export type LinkConvitePublicoDTO = z.infer<typeof linkConvitePublicoSchema>;

// Payload da landing page pública — dados suficientes pra alguém decidir entrar
// sem precisar estar logado. Nunca vaza dados sensíveis (telefones, e-mails).
export const convitePublicoDadosSchema = z.object({
  token: z.string(),
  pelada: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    nome: z.string(),
    descricao: z.string().nullable(),
    modalidade: z.string(),
    diaSemana: z.string(),
    horario: z.string(),
    totalJogadores: z.number().int().nonnegative(),
    aprovacaoObrigatoria: z.boolean(),
    abertaParaNovos: z.boolean(),
  }),
  local: z.object({
    nome: z.string(),
    bairro: z.string().nullable(),
    cidadeNome: z.string(),
    cidadeUf: z.string().length(2),
  }),
  criadoPor: z.object({
    nome: z.string(),
  }),
  totalMembros: z.number().int().nonnegative(),
  membrosPreview: z.array(
    z.object({
      nome: z.string(),
      avatarInicial: z.string().length(1),
    }),
  ),
});
export type ConvitePublicoDadosDTO = z.infer<typeof convitePublicoDadosSchema>;

// Resposta ao entrar via convite público — indica se virou membro direto
// ou candidatura pendente (quando aprovacaoObrigatoria = true).
export const entrarConvitePublicoResponseSchema = z.object({
  estado: z.enum(['membro', 'candidatura', 'ja_membro', 'ja_candidatura']),
  peladaSlug: z.string(),
});
export type EntrarConvitePublicoResponse = z.infer<typeof entrarConvitePublicoResponseSchema>;
