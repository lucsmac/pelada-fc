import { z } from 'zod';

export const erroResponseSchema = z.object({
  mensagem: z.string(),
});
export type ErroResponse = z.infer<typeof erroResponseSchema>;

// Telefone: apenas dígitos, 10 ou 11 (fixo/celular BR). Formatação removida no cliente.
export const telefoneSchema = z
  .string()
  .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos');

export const signupBodySchema = z.object({
  nome: z.string().min(2).max(80),
  telefone: telefoneSchema,
  senha: z.string().min(8).max(128),
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.object({
  telefone: telefoneSchema,
  senha: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  email: z.string().email().nullable(),
  jogadorId: z.string().uuid().nullable(),
  reivindicou: z.boolean().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  usuario: authUserSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  usuario: authUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
