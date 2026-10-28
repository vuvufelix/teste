import { z } from 'zod';

export const updatePdfSettingsSchema = z.object({
  logoUrl: z.string().url('URL do logótipo inválido.').optional().nullable(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Cor primária em formato HEX inválido.').optional(),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Cor secundária em formato HEX inválido.').optional(),
  templateStyle: z.enum(['STANDARD', 'MODERN', 'EXECUTIVE', 'MINIMAL']).optional(),
  customHeader: z.string().max(250, 'O cabeçalho não pode exceder 250 caracteres.').optional().nullable(),
  customFooter: z.string().max(250, 'O rodapé não pode exceder 250 caracteres.').optional().nullable(),
  hideWatermark: z.boolean().optional(),
});

export type UpdatePdfSettingsDTO = z.infer<typeof updatePdfSettingsSchema>;