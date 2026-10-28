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
import { FetchedSocialStats, SocialStatsService } from "../services/social-stats.service.js"

export class MediaKitController {
  // 🎯 Helper privado para resolver o ID do utilizador alvo (suporta agências com delegação aceite)
  private static async resolveTargetUserId(req: AuthenticatedRequest): Promise<string | null> {
    if (!req.user) return null;

    let targetUserId = req.user.id;
    const requestedCreatorId = (req.headers['x-target-creator-id'] as string) || req.body?.creatorId;

    if (req.user.role === 'AGENCY' && requestedCreatorId) {
      const delegation = await prisma.agencyDelegation.findUnique({
        where: {
          agencyId_creatorId: {
            agencyId: req.user.id,
            creatorId: requestedCreatorId,
          },
        },
      });

      if (!delegation || delegation.status !== 'ACCEPTED') {
        return null; // Não autorizado ou sem delegação aceite
      }

      targetUserId = requestedCreatorId;
    }

    return targetUserId;
  }

  // Helper privado para verificar se o utilizador tem acesso total (Trial, Active ou Super Admin)
  private static hasFullAccess(user: { subscriptionStatus?: string | null; role?: string | null }) {
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'TRIALING') return true;
    return false;
  }

  // Busca ou cria automaticamente o Mídia Kit do usuário logado ou do criador delegado
  static async getMyMediaKit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada para este criador.' });
    }

    let mediaKit = await prisma.mediaKit.findUnique({
      where: { userId: targetUserId },
      include: { socialNetworks: true },
    });

    if (!mediaKit) {
      const defaultSlug = `creator-${targetUserId.substring(0, 8)}`;
      mediaKit = await prisma.mediaKit.create({
        data: {
          userId: targetUserId,
          slug: defaultSlug,
          isPublic: true,
        },
        include: { socialNetworks: true },
      });
    }

    return res.status(200).json({ mediaKit });
  }

  // Atualiza as informações gerais do Mídia Kit (com validação de customDomain)
  static async updateMyMediaKit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada para este criador.' });
    }

    const parseResult = updateMediaKitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados do Mídia Kit.',
        details: parseResult.error.format(),
      });
    }

    const { slug, bio, niche, location, isPublic, customDomain } = parseResult.data as any;

    const userWithPlan = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { plan: true },
    });

    if (customDomain) {
      const hasAccess = userWithPlan ? MediaKitController.hasFullAccess(userWithPlan) : false;
      const isDomainAllowed = userWithPlan?.plan?.customDomainAllowed;
      const isInTrial = userWithPlan?.subscriptionStatus === 'TRIALING';

      if (!isInTrial && (!hasAccess || !isDomainAllowed)) {
        return res.status(403).json({
          error: 'O seu plano atual não permite o uso de domínio personalizado. Faça upgrade para o plano Pro ou Agência.',
          code: 'CUSTOM_DOMAIN_NOT_ALLOWED',
        });
      }
    }

    const existingSlug = await prisma.mediaKit.findFirst({
      where: {
        slug,
        NOT: { userId: targetUserId },
      },
    });

    if (existingSlug) {
      return res.status(409).json({ error: 'Este slug personalizado já está em uso.' });
    }

    const updatedMediaKit = await prisma.mediaKit.upsert({
      where: { userId: targetUserId },
      update: { slug, bio, niche, location, isPublic, ...(customDomain !== undefined && { customDomain }) },
      create: { userId: targetUserId, slug, bio, niche, location, isPublic, customDomain },
      include: { socialNetworks: true },
    });

    return res.status(200).json({ mediaKit: updatedMediaKit });
  }

  // Upload de Imagens do Mídia Kit (Perfil/Capa)
  static async uploadImage(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada para este criador.' });
    }

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
      where: { userId: targetUserId },
      update: updateData,
      create: { userId: targetUserId, slug: `creator-${targetUserId.substring(0, 8)}`, ...updateData },
    });

    return res.status(200).json({
      message: 'Imagem enviada com sucesso.',
      imageUrl,
      mediaKit: updatedMediaKit,
    });
  }

  // Visualização Pública do Mídia Kit pelo Slug (Protegido contra exposição de dados sensíveis - Fase 11.4)
  static async getPublicMediaKit(req: Request, res: Response) {
    const { slug } = req.params;

    const mediaKit = await prisma.mediaKit.findUnique({
      where: { slug, isPublic: true },
      select: {
        id: true,
        slug: true,
        bio: true,
        profilePicture: true,
        coverImage: true,
        niche: true,
        location: true,
        isPublic: true,
        customDomain: true,
        user: {
          select: {
            name: true,
            role: true,
            // 🔒 Nunca exponha email privado, passwordHash ou refreshTokenHash!
          },
        },
        socialNetworks: {
          select: {
            id: true,
            platform: true,
            handle: true,
            username: true,
            profileUrl: true,
            followersCount: true,
            engagementRate: true,
            monthlyViews: true,
            targetAudience: true,
            pricePerPost: true,
            source: true,     // Transparência da Fase 10
            syncStatus: true, // Transparência da Fase 10
          },
        },
      },
    });

    if (!mediaKit) {
      return res.status(404).json({ error: 'Mídia Kit não encontrado ou não está público.' });
    }

    return res.status(200).json({ mediaKit });
  }

  // Adicionar Rede Social ao Mídia Kit (Modelo Híbrido: Automático + Manual)
  static async addSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada para este criador.' });
    }

    const parseResult = addSocialNetworkSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação na rede social.',
        details: parseResult.error.format(),
      });
    }

    const {
      platform,
      profileUrl,
      username: customUsername,
      followersCount: manualFollowers,
      engagementRate: manualEngagement,
      monthlyViews,
      targetAudience,
      pricePerPost,
    } = parseResult.data as any;

    let mediaKit = await prisma.mediaKit.findUnique({
      where: { userId: targetUserId },
      include: { socialNetworks: true },
    });

    if (!mediaKit) {
      mediaKit = await prisma.mediaKit.create({
        data: { userId: targetUserId, slug: `creator-${targetUserId.substring(0, 8)}` },
        include: { socialNetworks: true },
      });
    }

    const userWithPlan = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { plan: true },
    });

    const subscriptionStatus = userWithPlan?.subscriptionStatus;
    const isSuperAdmin = userWithPlan?.role === 'SUPER_ADMIN';
    const isTrialing = subscriptionStatus === 'TRIALING';
    const isActive = subscriptionStatus === 'ACTIVE';

    if (!isActive && !isTrialing && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Sua assinatura está inativa ou expirou. Assine um plano para adicionar redes sociais.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    if (!isTrialing && !isSuperAdmin && userWithPlan?.plan && userWithPlan.plan.maxSocialNetworks !== -1) {
      if (mediaKit.socialNetworks.length >= userWithPlan.plan.maxSocialNetworks) {
        return res.status(403).json({
          error: `Seu plano atual permite cadastrar no máximo ${userWithPlan.plan.maxSocialNetworks} rede(s) social(is). Faça upgrade para adicionar mais.`,
          code: 'PLAN_LIMIT_REACHED',
        });
      }
    }

    let autoStats: FetchedSocialStats = { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: customUsername || '' };
    
    if ((!manualFollowers || manualFollowers === 0) && profileUrl) {
      try {
        autoStats = await SocialStatsService.fetchStats(platform, profileUrl);
      } catch (err) {
        console.warn('⚠️ Falha ao buscar estatísticas automáticas, prosseguindo com dados informados:', err);
      }
    }

    const handleValue = customUsername || autoStats.handle || '';
    const cleanUsername = handleValue.replace('@', '');

    const newSocialNetwork = await prisma.socialNetwork.create({
      data: {
        mediaKitId: mediaKit.id,
        platform,
        profileUrl: profileUrl || '',
        handle: handleValue.startsWith('@') ? handleValue : `@${handleValue}`,
        username: cleanUsername,
        followersCount: manualFollowers ?? autoStats.followersCount,
        engagementRate: manualEngagement ?? autoStats.engagementRate,
        monthlyViews: monthlyViews ?? autoStats.monthlyViews ?? 0,
        targetAudience: targetAudience || null,
        pricePerPost: pricePerPost ?? 0.0,
        lastUpdated: new Date(),
      },
    });

    return res.status(201).json({
      message: 'Rede social adicionada com sucesso (Modelo Híbrido).',
      socialNetwork: newSocialNetwork,
    });
  }

  // Atualizar Rede Social existente (Validando propriedade ou delegação)
  static async updateSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada.' });
    }

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

    if (!socialNetwork || socialNetwork.mediaKit.userId !== targetUserId) {
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

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada.' });
    }

    const socialNetwork = await prisma.socialNetwork.findUnique({
      where: { id },
      include: { mediaKit: true },
    });

    if (!socialNetwork || socialNetwork.mediaKit.userId !== targetUserId) {
      return res.status(404).json({ error: 'Rede social não encontrada ou sem permissão.' });
    }

    await prisma.socialNetwork.delete({ where: { id } });

    return res.status(200).json({ message: 'Rede social removida com sucesso.' });
  }

  // Re-sincroniza manualmente as métricas de uma rede social (Com trava de cache de 24h)
  static async syncSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const targetUserId = await MediaKitController.resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(403).json({ error: 'Acesso negado ou delegação não autorizada.' });
    }

    const socialNetwork = await prisma.socialNetwork.findUnique({
      where: { id },
      include: { mediaKit: true },
    });

    if (!socialNetwork || socialNetwork.mediaKit.userId !== targetUserId) {
      return res.status(404).json({ error: 'Rede social não encontrada ou sem permissão.' });
    }

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    // 🚀 Corrigido de lastUpdated para lastSyncedAt conforme o schema atual
    const lastSyncedAt = socialNetwork.lastSyncedAt ? new Date(socialNetwork.lastSyncedAt).getTime() : 0;

    if (now - lastSyncedAt < TWENTY_FOUR_HOURS_MS) {
      const hoursRemaining = Math.ceil((TWENTY_FOUR_HOURS_MS - (now - lastSyncedAt)) / (1000 * 60 * 60));
      return res.status(429).json({
        error: `Você já atualizou estas métricas hoje. Aguarde ${hoursRemaining} hora(s) para sincronizar novamente.`,
        code: 'SYNC_RATE_LIMIT',
      });
    }

    const targetUrlOrHandle = socialNetwork.profileUrl || socialNetwork.handle || '';

    const updatedStats = await SocialStatsService.fetchStats(
      socialNetwork.platform,
      targetUrlOrHandle
    );

    const updatedSocialNetwork = await prisma.socialNetwork.update({
      where: { id },
      data: {
        followersCount: updatedStats.followersCount || socialNetwork.followersCount,
        engagementRate: updatedStats.engagementRate || socialNetwork.engagementRate,
        monthlyViews: (updatedStats.monthlyViews ?? 0) > 0 ? updatedStats.monthlyViews : socialNetwork.monthlyViews,
        lastSyncedAt: new Date(), // 🚀 Atualizado para o campo correto
        source: 'AUTOMATED',      // 🚀 Registo da origem automática (Fase 10)
        syncStatus: 'SUCCESS',    // 🚀 Estado de sucesso na sincronização (Fase 10)
      },
    });

    return res.status(200).json({
      message: 'Métricas atualizadas com sucesso!',
      socialNetwork: updatedSocialNetwork,
    });
  }
}