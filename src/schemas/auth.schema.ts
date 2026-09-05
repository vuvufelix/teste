import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  email: z.string().email('E-mail em formato inválido.'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  role: z.enum(['INFLUENCER', 'AGENCY']).optional().default('INFLUENCER'),
});

export const loginSchema = z.object({
  email: z.string().email('E-mail em formato inválido.'),
  password: z.string().min(1, 'A senha é obrigatória.'),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;