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
  platform: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN']),
  username: z.string().min(1, 'O nome de usuário é obrigatório.').optional(),
  profileUrl: z.string().url('URL inválida.').optional().or(z.literal('')),
  
  // Métricas automáticas opcionais
  followersCount: z.number().int().nonnegative('O número de seguidores não pode ser negativo.').optional(),
  engagementRate: z.number().min(0).max(100, 'A taxa de engajamento deve estar entre 0 e 100.').optional(),
  
  // 👈 Novos campos do Modelo Híbrido (Manuais)
  monthlyViews: z.number().int().nonnegative('As visualizações não podem ser negativas.').optional().default(0),
  targetAudience: z.string().max(255, 'O público-alvo deve ter no máximo 255 caracteres.').optional(),
  pricePerPost: z.number().nonnegative('O preço não pode ser negativo.').optional().default(0),
  
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