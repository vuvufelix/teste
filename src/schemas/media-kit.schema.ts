import { z } from 'zod';

export const updateMediaKitSchema = z.object({
  slug: z
    .string()
    .min(3, 'O slug deve ter no mínimo 3 caracteres.')
    .max(50, 'O slug deve ter no máximo 50 caracteres.')
    .regex(/^[a-z0-9-]+$/, 'O slug deve conter apenas letras minúsculas, números e hífens.'),
  bio: z.string().max(1000, 'A biografia deve ter no máximo 1000 caracteres.').optional(),
  niche: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  isPublic: z.boolean().optional(),
});

export const addSocialNetworkSchema = z.object({
  platform: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN']),
  username: z.string().min(1, 'O nome de usuário é obrigatório.'),
  profileUrl: z.string().url('URL inválida.').optional().or(z.literal('')),
  followersCount: z.number().int().nonnegative('O número de seguidores não pode ser negativo.'),
  engagementRate: z.number().min(0).max(100, 'A taxa de engajamento deve estar entre 0 e 100.'),
  avgImpressions: z.number().int().nonnegative().optional().default(0),
});

export const updateSocialNetworkSchema = addSocialNetworkSchema.partial();

export const uploadImageSchema = z.object({
  imageType: z.enum(['PROFILE', 'COVER']),
  fileBase64: z.string().min(1, 'String da imagem em Base64 é obrigatória.'),
});

export type UpdateMediaKitDTO = z.infer<typeof updateMediaKitSchema>;
export type AddSocialNetworkDTO = z.infer<typeof addSocialNetworkSchema>;
export type UpdateSocialNetworkDTO = z.infer<typeof updateSocialNetworkSchema>;
export type UploadImageDTO = z.infer<typeof uploadImageSchema>;