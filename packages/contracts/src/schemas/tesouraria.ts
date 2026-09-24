import { z } from 'zod';
import { TIPOS_CUSTO } from '@peladafc/domain';

export const tipoCustoSchema = z.enum(TIPOS_CUSTO);
export type TipoCusto = z.infer<typeof tipoCustoSchema>;

// -----------------------------------------------------------------------------
// Custo recorrente (nível pelada)

export const custoRecorrenteSchema = z.object({
  id: z.string().uuid(),
  peladaId: z.string().uuid(),
  nome: z.string(),
  tipo: tipoCustoSchema,
  valorCentavos: z.number().int().nonnegative(),
  ativo: z.boolean(),
  criadoEm: z.coerce.date(),
});
export type CustoRecorrenteDTO = z.infer<typeof custoRecorrenteSchema>;

export const listarCustosRecorrentesResponseSchema = z.object({
  itens: z.array(custoRecorrenteSchema),
});
export type ListarCustosRecorrentesResponse = z.infer<
  typeof listarCustosRecorrentesResponseSchema
>;

export const criarCustoRecorrenteBodySchema = z.object({
  nome: z.string().min(1).max(80),
  tipo: tipoCustoSchema,
  valorCentavos: z.number().int().nonnegative().max(10_000_000), // R$100k teto
  ativo: z.boolean().default(true),
});
export type CriarCustoRecorrenteBody = z.infer<typeof criarCustoRecorrenteBodySchema>;

export const atualizarCustoRecorrenteBodySchema = criarCustoRecorrenteBodySchema
  .partial();
export type AtualizarCustoRecorrenteBody = z.infer<
  typeof atualizarCustoRecorrenteBodySchema
>;

// -----------------------------------------------------------------------------
// Custo avulso (nível partida)

export const custoPartidaSchema = z.object({
  id: z.string().uuid(),
  partidaId: z.string().uuid(),
  nome: z.string(),
  tipo: tipoCustoSchema,
  valorCentavos: z.number().int().nonnegative(),
  criadoPorUserId: z.string().uuid(),
  criadoEm: z.coerce.date(),
});
export type CustoPartidaDTO = z.infer<typeof custoPartidaSchema>;

export const criarCustoPartidaBodySchema = z.object({
  nome: z.string().min(1).max(80),
  tipo: tipoCustoSchema,
  valorCentavos: z.number().int().nonnegative().max(10_000_000),
});
export type CriarCustoPartidaBody = z.infer<typeof criarCustoPartidaBodySchema>;

export const atualizarCustoPartidaBodySchema = criarCustoPartidaBodySchema.partial();
export type AtualizarCustoPartidaBody = z.infer<typeof atualizarCustoPartidaBodySchema>;

// -----------------------------------------------------------------------------
// Pagamento

export const pagamentoPartidaSchema = z.object({
  id: z.string().uuid(),
  partidaId: z.string().uuid(),
  jogadorId: z.string().uuid(),
  valorCentavos: z.number().int().nonnegative(),
  pagoEm: z.coerce.date(),
  marcadoPorUserId: z.string().uuid(),
});
export type PagamentoPartidaDTO = z.infer<typeof pagamentoPartidaSchema>;

// Se valorCentavos for omitido, backend usa o cálculo atual.
export const marcarPagamentoBodySchema = z.object({
  jogadorId: z.string().uuid(),
  valorCentavos: z.number().int().nonnegative().max(10_000_000).optional(),
});
export type MarcarPagamentoBody = z.infer<typeof marcarPagamentoBodySchema>;

// -----------------------------------------------------------------------------
// GET /partidas/:id/tesouraria — payload agrupado

const jogadorMiniSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  avatarInicial: z.string().length(1),
  userId: z.string().uuid().nullable(),
});

export const linhaDevedorSchema = z.object({
  jogador: jogadorMiniSchema,
  origem: z.enum(['membro', 'convidado']),
  valorDevidoCentavos: z.number().int().nonnegative(),
  pago: z.boolean(),
  pagamento: pagamentoPartidaSchema.nullable(),
});
export type LinhaDevedorDTO = z.infer<typeof linhaDevedorSchema>;

export const resumoTesourariaSchema = z.object({
  totalPorJogadorCentavos: z.number().int().nonnegative(),
  totalRateadoCentavos: z.number().int().nonnegative(),
  nDivisores: z.number().int().nonnegative(),
  valorPorJogadorCentavos: z.number().int().nonnegative(),
  estimado: z.boolean(),
});
export type ResumoTesourariaDTO = z.infer<typeof resumoTesourariaSchema>;

export const tesourariaPartidaResponseSchema = z.object({
  convidadosPagamCustos: z.boolean(),
  custosRecorrentes: z.array(custoRecorrenteSchema),
  custosPartida: z.array(custoPartidaSchema),
  resumo: resumoTesourariaSchema,
  devedores: z.array(linhaDevedorSchema),
});
export type TesourariaPartidaResponse = z.infer<typeof tesourariaPartidaResponseSchema>;
