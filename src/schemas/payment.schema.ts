import { z } from 'zod';

export const createStripeCheckoutSchema = z.object({
  planSlug: z.enum(['basic', 'pro', 'agency']),
});

export const createManualAOAPaymentSchema = z.object({
  planSlug: z.enum(['basic', 'pro', 'agency']),
  receiptBase64: z.string().min(1, 'O comprovativo em formato Base64 é obrigatório.'),
  bankReference: z.string().optional(),
});

export type CreateStripeCheckoutDTO = z.infer<typeof createStripeCheckoutSchema>;
export type CreateManualAOAPaymentDTO = z.infer<typeof createManualAOAPaymentSchema>;