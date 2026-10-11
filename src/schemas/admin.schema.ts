import { z } from 'zod';

export const reviewPaymentSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

export const updateUserPlanSchema = z.object({
  planSlug: z.enum(['basic', 'pro', 'agency']),
  subscriptionStatus: z.enum(['ACTIVE', 'CANCELLED', 'TRIALING', 'EXPIRED', 'INACTIVE']),
});

export type ReviewPaymentDTO = z.infer<typeof reviewPaymentSchema>;
export type UpdateUserPlanDTO = z.infer<typeof updateUserPlanSchema>;