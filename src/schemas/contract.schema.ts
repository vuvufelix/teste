import { z } from 'zod';

export const createContractSchema = z.object({
  contractType: z.enum([
    'CONTENT_CREATION',
    'SPONSORED_POST',
    'MULTIPLATFORM',
    'INFLUENCER_SERVICES',
    'AGENCY_REPRESENTATION',
  ]),
  title: z.string().min(3, 'O título do contrato é obrigatório.'),
  brandName: z.string().min(2, 'O nome da marca/entidade é obrigatório.'),
  brandEmail: z.string().email('E-mail da marca inválido.').optional().nullable(),
  totalAmount: z.number().positive('O valor total deve ser positivo.'),
  currency: z.enum(['AOA', 'USD', 'EUR']).default('USD'),
  servicesDescription: z.string().min(5, 'A descrição dos serviços é obrigatória.'),
  paymentTerms: z.string().optional().nullable(),
  deliveryDeadline: z.string().optional().nullable(),
  revisionCount: z.number().int().nonnegative().default(2),
  cancellationTerms: z.string().optional().nullable(),
  contentUsageRights: z.string().optional().nullable(),
  usageDuration: z.string().optional().nullable(),
  isExclusive: z.boolean().default(false),
  exclusivityTerms: z.string().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  creatorId: z.string().uuid().optional().nullable(), // Para agências
});

export const updateContractStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'PREPARATION',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'SIGNED',
    'COMPLETED',
    'CANCELED',
  ]),
});

export type CreateContractDTO = z.infer<typeof createContractSchema>;