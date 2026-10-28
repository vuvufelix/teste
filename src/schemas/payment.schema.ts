import { z } from 'zod';

export const createCheckoutSchema = z.object({
  planSlug: z.enum([
    'influencer-free',
    'influencer-basic',
    'influencer-pro',
    'agency-free',
    'agency-basic',
    'agency-pro',
    'basic', // Mantido para compatibilidade retroativa
    'pro',
    'agency'
  ]),
  currency: z.enum(['AOA', 'USD', 'EUR'], {
    errorMap: () => ({ message: 'Moeda inválida. Escolha entre AOA, USD ou EUR.' }),
  }),
});

export const createManualAOAPaymentSchema = z.object({
  planSlug: z.enum([
    'influencer-free',
    'influencer-basic',
    'influencer-pro',
    'agency-free',
    'agency-basic',
    'agency-pro',
    'basic',
    'pro',
    'agency'
  ]),
  receiptBase64: z.string().min(1, 'O comprovativo em formato Base64 é obrigatório.'),
  bankReference: z.string().optional(),
});

export type CreateCheckoutDTO = z.infer<typeof createCheckoutSchema>;
export type CreateManualAOAPaymentDTO = z.infer<typeof createManualAOAPaymentSchema>;