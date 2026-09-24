import { z } from 'zod';
import { MODALIDADES, MODALIDADE_LABEL, type Modalidade } from '@peladafc/domain';

export const modalidadeSchema = z.enum(MODALIDADES);
export { MODALIDADES, MODALIDADE_LABEL, type Modalidade };

export const TIPOS_LOCAL = [
  'arena_society',
  'campo_futebol_11',
  'campo_futebol_7',
  'campo_areia',
  'quadra_coberta',
  'quadra_aberta',
] as const;
export const tipoLocalSchema = z.enum(TIPOS_LOCAL);
export type TipoLocal = z.infer<typeof tipoLocalSchema>;

export const TIPO_LOCAL_LABEL: Record<TipoLocal, string> = {
  arena_society: 'Arena society',
  campo_futebol_11: 'Campo de futebol 11',
  campo_futebol_7: 'Campo de futebol 7',
  campo_areia: 'Campo de areia',
  quadra_coberta: 'Quadra coberta',
  quadra_aberta: 'Quadra aberta',
};

export const SUPERFICIES = ['grama_sintetica', 'grama_natural', 'areia', 'piso'] as const;
export const superficieSchema = z.enum(SUPERFICIES);
export type Superficie = z.infer<typeof superficieSchema>;

export const SUPERFICIE_LABEL: Record<Superficie, string> = {
  grama_sintetica: 'Grama sintética',
  grama_natural: 'Grama natural',
  areia: 'Areia',
  piso: 'Piso',
};

export const UF_REGEX = /^[A-Z]{2}$/;

export const localSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(2).max(120),
  tipo: tipoLocalSchema,
  cidadeNome: z.string().min(2).max(80),
  cidadeUf: z.string().regex(UF_REGEX),
  bairro: z.string().max(80).nullable(),
  endereco: z.string().max(200).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  superficies: z.array(superficieSchema),
  modalidadesSuportadas: z.array(modalidadeSchema),
  verificado: z.boolean(),
  criadoPorUserId: z.string().uuid(),
  criadoEm: z.coerce.date(),
});
export type LocalDTO = z.infer<typeof localSchema>;

export const criarLocalBodySchema = z.object({
  nome: z.string().min(2).max(120),
  tipo: tipoLocalSchema,
  cidadeNome: z.string().min(2).max(80),
  cidadeUf: z.string().regex(UF_REGEX, 'UF deve ser 2 letras maiúsculas'),
  bairro: z.string().max(80).optional(),
  endereco: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  superficies: z.array(superficieSchema).default([]),
  modalidadesSuportadas: z.array(modalidadeSchema).min(1, 'Selecione ao menos uma modalidade'),
});
export type CriarLocalBody = z.infer<typeof criarLocalBodySchema>;

export const listarLocaisQuerySchema = z.object({
  cidade: z.string().optional(),
  uf: z.string().regex(UF_REGEX).optional(),
  bairro: z.string().optional(),
  tipo: tipoLocalSchema.optional(),
  modalidade: modalidadeSchema.optional(),
  busca: z.string().max(80).optional(),
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().positive().max(50).default(20),
});
export type ListarLocaisQuery = z.infer<typeof listarLocaisQuerySchema>;

export const listarLocaisResponseSchema = z.object({
  itens: z.array(localSchema),
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  porPagina: z.number().int().positive(),
});
export type ListarLocaisResponse = z.infer<typeof listarLocaisResponseSchema>;
