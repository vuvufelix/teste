import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter no mínimo 16 caracteres.'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter no mínimo 16 caracteres.'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional().default('demo'),
  CLOUDINARY_API_KEY: z.string().optional().default('123456789'),
  CLOUDINARY_API_SECRET: z.string().optional().default('secret'),

  // Stripe (USD)
  STRIPE_SECRET_KEY: z.string().optional().default('sk_test_mock'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default('whsec_mock'),

  // Dados Bancários Nacionais para Pagamento em Kwanza (AOA)
  BANK_IBAN_AOA: z.string().default('AO06.0040.0000.1234.5678.1014.3'),
  BANK_ACCOUNT_NAME: z.string().default('Media Kit SaaS Lda'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Variáveis de ambiente inválidas:', _env.error.format());
  throw new Error('Falha na validação das variáveis de ambiente.');
}

export const env = _env.data;