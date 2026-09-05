import { z } from 'zod';

export const proposalItemSchema = z.object({
  deliverable: z.string().min(2, 'A descrição do entregável é obrigatória.'),
  quantity: z.number().int().positive('A quantidade deve ser maior que zero.').default(1),
  unitPrice: z.number().positive('O valor unitário deve ser positivo.'),
});

export const createProposalSchema = z.object({
  brandName: z.string().min(2, 'O nome da marca é obrigatório.'),
  brandEmail: z.string().email('E-mail da marca inválido.').optional().or(z.literal('')),
  title: z.string().min(3, 'O título da proposta é obrigatório.'),
  description: z.string().optional(),
  currency: z.enum(['USD', 'AOA', 'BRL']).default('USD'),
  validUntil: z.string().datetime({ message: 'Data de validade deve ser uma data ISO válida.' }),
  items: z.array(proposalItemSchema).min(1, 'A proposta deve ter no mínimo 1 item entregável.'),
});

export const updateProposalStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']),
});

export type CreateProposalDTO = z.infer<typeof createProposalSchema>;
export type UpdateProposalStatusDTO = z.infer<typeof updateProposalStatusSchema>;