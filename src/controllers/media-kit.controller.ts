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
  // Helper privado para verificar se o utilizador tem acesso total (Trial, Active ou Super Admin)
  private static hasFullAccess(user: { subscriptionStatus?: string | null; role?: string | null }) {
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'TRIALING') return true;
    return false;
  }

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

  // Atualiza as informações gerais do Mídia Kit (com validação de customDomain)
  static async updateMyMediaKit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = updateMediaKitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados do Mídia Kit.',
        details: parseResult.error.format(),
      });
    }

    const { slug, bio, niche, location, isPublic, customDomain } = parseResult.data as any;

    const userWithPlan = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    if (customDomain) {
      // Durante o trial ou com plano ativo/admin, permite testar domínios personalizados
      const hasAccess = userWithPlan ? MediaKitController.hasFullAccess(userWithPlan) : false;
      const isDomainAllowed = userWithPlan?.plan?.customDomainAllowed;

      // Se estiver em trial, permitimos testar. Caso contrário, validamos o plano.
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
        NOT: { userId: req.user.id },
      },
    });

    if (existingSlug) {
      return res.status(409).json({ error: 'Este slug personalizado já está em uso.' });
    }

    const updatedMediaKit = await prisma.mediaKit.upsert({
      where: { userId: req.user.id },
      update: { slug, bio, niche, location, isPublic, ...(customDomain !== undefined && { customDomain }) },
      create: { userId: req.user.id, slug, bio, niche, location, isPublic, customDomain },
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

  // Adicionar Rede Social ao Mídia Kit (Modelo Híbrido: Automático + Manual)
  static async addSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

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
      where: { userId: req.user.id },
      include: { socialNetworks: true },
    });

    if (!mediaKit) {
      mediaKit = await prisma.mediaKit.create({
        data: { userId: req.user.id, slug: `creator-${req.user.id.substring(0, 8)}` },
        include: { socialNetworks: true },
      });
    }

    const userWithPlan = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    // 🔒 Verificação de Status da Assinatura (Bloqueia se inativa e NÃO estiver em trial)
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

    // 📏 Verificação de Limites do Plano (Se NÃO estiver em trial e NÃO for Super Admin, aplica o limite do plano)
    if (!isTrialing && !isSuperAdmin && userWithPlan?.plan && userWithPlan.plan.maxSocialNetworks !== -1) {
      if (mediaKit.socialNetworks.length >= userWithPlan.plan.maxSocialNetworks) {
        return res.status(403).json({
          error: `Seu plano atual permite cadastrar no máximo ${userWithPlan.plan.maxSocialNetworks} rede(s) social(is). Faça upgrade para adicionar mais.`,
          code: 'PLAN_LIMIT_REACHED',
        });
      }
    }

    // 🚀 BUSCA AUTOMÁTICA DAS MÉTRICAS SE O SEGUIDOR NÃO FOI INFORMADO MANUALMENTE
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

    // Salva a rede social combinando Automático + Manual
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

  // Re-sincroniza manualmente as métricas de uma rede social (Com trava de cache de 24h)
  static async syncSocialNetwork(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const socialNetwork = await prisma.socialNetwork.findUnique({
      where: { id },
      include: { mediaKit: true },
    });

    if (!socialNetwork || socialNetwork.mediaKit.userId !== req.user.id) {
      return res.status(404).json({ error: 'Rede social não encontrada ou sem permissão.' });
    }

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    const lastUpdated = socialNetwork.lastUpdated ? new Date(socialNetwork.lastUpdated).getTime() : 0;

    if (now - lastUpdated < TWENTY_FOUR_HOURS_MS) {
      const hoursRemaining = Math.ceil((TWENTY_FOUR_HOURS_MS - (now - lastUpdated)) / (1000 * 60 * 60));
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
        lastUpdated: new Date(),
      },
    });

    return res.status(200).json({
      message: 'Métricas atualizadas com sucesso!',
      socialNetwork: updatedSocialNetwork,
    });
  }
}