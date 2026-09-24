import { z } from 'zod';

export const temporadaSchema = z.object({
  id: z.string().uuid(),
  peladaId: z.string().uuid(),
  ano: z.number().int(),
  numero: z.number().int(),
  nome: z.string().nullable(),
  inicioEm: z.coerce.date(),
  fimEm: z.coerce.date().nullable(),
  encerradaEm: z.coerce.date().nullable(),
});
export type TemporadaDTO = z.infer<typeof temporadaSchema>;

export const criarTemporadaBodySchema = z.object({
  ano: z.number().int().min(2020).max(2100),
  numero: z.number().int().min(1).max(20),
  nome: z.string().max(80).optional(),
  inicioEm: z.coerce.date(),
  fimEm: z.coerce.date().optional(),
  ativarComoAtual: z.boolean().default(true),
});
export type CriarTemporadaBody = z.infer<typeof criarTemporadaBodySchema>;

export const editarTemporadaBodySchema = criarTemporadaBodySchema.partial();
export type EditarTemporadaBody = z.infer<typeof editarTemporadaBodySchema>;

export const listarTemporadasResponseSchema = z.object({
  itens: z.array(temporadaSchema),
  total: z.number().int().nonnegative(),
});
export type ListarTemporadasResponse = z.infer<typeof listarTemporadasResponseSchema>;
