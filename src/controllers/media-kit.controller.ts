import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  updateMediaKitSchema,
  addSocialNetworkSchema,
  updateSocialNetworkSchema,
  uploadImageSchema,
} from '../schemas/media-kit.schema.js';
import { CloudinaryService } from '../services/cloudinary.service.js';

export class MediaKitController {
  // Busca ou cria automaticamente o Mídia Kit do usuário logado
  static async getMyMediaKit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    let mediaKit = await prisma.mediaKit.findUnique({
      where: { userId: req.user.id },
      include: { socialNetworks: true },
    });

    if (!mediaKit) {
      const defaultSlug = `creator-${req.user.id.substring(0, 8)}`;
      mediaKit = await prisma.mediaKit.create({
        data: {
          userId: req.user.id,
          slug: defaultSlug,
          isPublic: true,
        },
        include: { socialNetworks: true },
      });
    }

    return res.status(200).json({ mediaKit });
  }

  // Atualiza as informações gerais do Mídia Kit
  static async updateMyMediaKit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = updateMediaKitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados do Mídia Kit.',
        details: parseResult.error.format(),
      });
    }

    const { slug, bio, niche, location, isPublic } = parseResult.data;

    // Verificar se o slug já está em uso por outro usuário
    const existingSlug = await prisma.mediaKit.findFirst({
      where: {
        slug,
        NOT: { userId: req.user.id },
      },
    });

    if (existingSlug) {
      return res.status(409).json({ error: 'Este slug personalizado já está em uso.' });
    }

    const updatedMediaKit = await prisma.mediaKit.upsert({
      where: { userId: req.user.id },
      update: { slug, bio, niche, location, isPublic },
      create: { userId: req.user.id, slug, bio, niche, location, isPublic },
      include: { socialNetworks: true },
    });

    return res.status(200).json({ mediaKit: updatedMediaKit });
  }

  // Upload de Imagens do Mídia Kit (Perfil/Capa)
  static async uploadImage(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = uploadImageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro nos parâmetros de upload.',
        details: parseResult.error.format(),
      });
    }

    const { imageType, fileBase64 } = parseResult.data;
    const imageUrl = await CloudinaryService.uploadImage(fileBase64, imageType.toLowerCase());

    const updateData =
      imageType === 'PROFILE' ? { profilePicture: imageUrl } : { coverImage: imageUrl };

    const updatedMediaKit = await prisma.mediaKit.upsert({
      where: { userId: req.user.id },
      update: updateData,
      create: { userId: req.user.id, slug: `creator-${req.user.id.substring(0, 8)}`, ...updateData },
    });

    return res.status(200).json({
      message: 'Imagem enviada com sucesso.',
      imageUrl,
      mediaKit: updatedMediaKit,
    });
  }

  // Visualização Pública do Mídia Kit pelo Slug
  static async getPublicMediaKit(req: Request, res: Response) {
    const { slug } = req.params;

    const mediaKit = await prisma.mediaKit.findUnique({
      where: { slug },
      include: {
        socialNetworks: true,
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (!mediaKit || !mediaKit.isPublic) {
      return res.status(404).json({ error: 'Mídia Kit não encontrado ou não está público.' });
    }

    return res.status(200).json({ mediaKit });
  }

  // Adicionar Rede Social ao Mídia Kit com validação de limites de plano
  static async addSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = addSocialNetworkSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação na rede social.',
        details: parseResult.error.format(),
      });
    }

    // Obter ou criar o Mídia Kit
    let mediaKit = await prisma.mediaKit.findUnique({
      where: { userId: req.user.id },
      include: { socialNetworks: true },
    });

    if (!mediaKit) {
      mediaKit = await prisma.mediaKit.create({
        data: { userId: req.user.id, slug: `creator-${req.user.id.substring(0, 8)}` },
        include: { socialNetworks: true },
      });
    }

    // Regra de Negócio: Limite do Plano
    const userWithPlan = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    if (userWithPlan?.plan && userWithPlan.plan.maxSocialNetworks !== -1) {
      if (mediaKit.socialNetworks.length >= userWithPlan.plan.maxSocialNetworks) {
        return res.status(403).json({
          error: `Seu plano atual permite cadastrar no máximo ${userWithPlan.plan.maxSocialNetworks} rede(s) social(is). Faça upgrade para adicionar mais.`,
          code: 'PLAN_LIMIT_REACHED',
        });
      }
    }

    const newSocialNetwork = await prisma.socialNetwork.create({
      data: {
        mediaKitId: mediaKit.id,
        ...parseResult.data,
      },
    });

    return res.status(201).json({ socialNetwork: newSocialNetwork });
  }

  // Atualizar Rede Social existente
  static async updateSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const parseResult = updateSocialNetworkSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: parseResult.error.format(),
      });
    }

    const socialNetwork = await prisma.socialNetwork.findUnique({
      where: { id },
      include: { mediaKit: true },
    });

    if (!socialNetwork || socialNetwork.mediaKit.userId !== req.user.id) {
      return res.status(404).json({ error: 'Rede social não encontrada ou sem permissão.' });
    }

    const updated = await prisma.socialNetwork.update({
      where: { id },
      data: parseResult.data,
    });

    return res.status(200).json({ socialNetwork: updated });
  }

  // Remover Rede Social
  static async deleteSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const socialNetwork = await prisma.socialNetwork.findUnique({
      where: { id },
      include: { mediaKit: true },
    });

    if (!socialNetwork || socialNetwork.mediaKit.userId !== req.user.id) {
      return res.status(404).json({ error: 'Rede social não encontrada ou sem permissão.' });
    }

    await prisma.socialNetwork.delete({ where: { id } });

    return res.status(200).json({ message: 'Rede social removida com sucesso.' });
  }
}