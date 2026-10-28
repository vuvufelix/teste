import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { NotificationService } from '../services/notification.service.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { PlanEntitlementService } from '../services/plan-entitlement.service.js';

export class AgencyController {
  // 1. Agência envia um convite de delegação para o criador através do e-mail
  static async inviteCreator(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Apenas contas do tipo Agência podem enviar convites de gestão.' });
    }

    const { creatorEmail } = req.body;
    if (!creatorEmail) {
      return res.status(400).json({ error: 'Informe o e-mail do criador.' });
    }

    // 🔒 Verificação centralizada de permissões e limites do plano da agência
    const entitlement = await PlanEntitlementService.getUserEntitlements(req.user.id);
    if (!entitlement.authorized) {
      return res.status(entitlement.status || 403).json({ error: entitlement.error });
    }

    // Validar limite maxCreators permitido pelo plano atual da agência (Contabiliza ativos e pendentes)
    const maxCreators = entitlement.limits!.maxCreators;
    const activeOrPendingCount = await prisma.agencyDelegation.count({
      where: {
        agencyId: req.user.id,
        status: { in: ['ACCEPTED', 'PENDING'] },
      },
    });

    if (activeOrPendingCount >= maxCreators) {
      return res.status(403).json({
        error: `Atingiu o limite máximo de ${maxCreators} criadores (ativos ou pendentes) permitidos no seu plano comercial atual.`,
        code: 'CREATOR_LIMIT_EXCEEDED',
      });
    }

    // Busca o criador na base de dados
    const creator = await prisma.user.findUnique({ where: { email: creatorEmail } });
    if (!creator) {
      return res.status(404).json({ error: 'Criador não encontrado na plataforma Influkit.' });
    }

    if (creator.role !== 'INFLUENCER') {
      return res.status(400).json({ error: 'O e-mail informado não pertence a uma conta válida de criador.' });
    }

    if (creator.id === req.user.id) {
      return res.status(400).json({ error: 'Uma agência não pode convidar a sua própria conta.' });
    }

    // Cria ou atualiza o registo de delegação com status PENDING
    const delegation = await prisma.agencyDelegation.upsert({
      where: {
        agencyId_creatorId: {
          agencyId: req.user.id,
          creatorId: creator.id,
        },
      },
      update: { status: 'PENDING' },
      create: {
        agencyId: req.user.id,
        creatorId: creator.id,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      message: 'Convite enviado com sucesso ao criador!',
      delegation,
    });
  }

  // 2. Criador lista os convites pendentes que recebeu de agências (Com foto da agência)
  static async getMyPendingInvites(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const delegations = await prisma.agencyDelegation.findMany({
      where: {
        creatorId: req.user.id,
        status: 'PENDING',
      },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            email: true,
            mediaKit: {
              select: { profilePicture: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const invites = delegations.map((d: any) => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      agency: {
        id: d.agency.id,
        name: d.agency.name,
        email: d.agency.email,
        profilePicture: d.agency.mediaKit?.profilePicture || null,
      },
    }));

    return res.status(200).json({ invites });
  }

  // 3. Agência lista todos os convites que enviou (Pendentes, Aceites, etc.)
  static async getAgencySentInvites(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const delegations = await prisma.agencyDelegation.findMany({
      where: { agencyId: req.user.id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            mediaKit: {
              select: { profilePicture: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const invites = delegations.map((d: any) => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      creatorEmail: d.creator.email,
      creatorName: d.creator.name,
      profilePicture: d.creator.mediaKit?.profilePicture || null,
    }));

    return res.status(200).json({ invites });
  }

  // 4. Agência cancela/remove um convite enviado
  static async cancelInvite(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { delegationId } = req.params;

    const delegation = await prisma.agencyDelegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation || delegation.agencyId !== req.user.id) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    await prisma.agencyDelegation.delete({
      where: { id: delegationId },
    });

    return res.status(200).json({ message: 'Convite cancelado e removido com sucesso.' });
  }

  // 5. Criador aceita ou recusa o convite da agência (Com validação segura de limite maxCreators)
  static async respondToInvite(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    
    const { delegationId } = req.params;
    const { status } = req.body; // 'ACCEPTED' ou 'REVOKED' / 'REJECTED'

    if (!['ACCEPTED', 'REVOKED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use ACCEPTED ou REVOKED.' });
    }

    const normalizedStatus = status === 'REJECTED' ? 'REVOKED' : status;

    const delegation = await prisma.agencyDelegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation || delegation.creatorId !== req.user.id) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    // Se o criador estiver a aceitar, verificamos rigorosamente se a agência ainda tem vaga (maxCreators)
    if (normalizedStatus === 'ACCEPTED') {
      const entitlement = await PlanEntitlementService.getUserEntitlements(delegation.agencyId);
      if (!entitlement.authorized) {
        return res.status(403).json({ error: 'A agência associada não possui um plano ativo válido.' });
      }

      const maxCreators = entitlement.limits!.maxCreators;
      const activeCount = await prisma.agencyDelegation.count({
        where: {
          agencyId: delegation.agencyId,
          status: 'ACCEPTED',
        },
      });

      if (activeCount >= maxCreators) {
        return res.status(403).json({
          error: `A agência atingiu o limite máximo de ${maxCreators} criadores geridos permitidos no plano atual.`,
          code: 'CREATOR_LIMIT_EXCEEDED',
        });
      }
    }

    const updatedDelegation = await prisma.agencyDelegation.update({
      where: { id: delegationId },
      data: { status: normalizedStatus },
    });

    await NotificationService.sendPushToUser(delegation.agencyId, {
        title: normalizedStatus === 'ACCEPTED' ? 'Convite Aceite! 🎉' : 'Convite Recusado',
        body: `O criador atualizou o status do convite para ${normalizedStatus}.`,
        url: '/dashboard/agency',
    });

    return res.status(200).json({
      message: `Convite atualizado com sucesso.`,
      delegation: updatedDelegation,
    });
  }

  // 6. Agência lista todos os criadores com delegação ativa (ACCEPTED)
  static async getMyManagedCreators(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado. Apenas agências podem consultar esta lista.' });
    }

    const agencyUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    const isSuperAdmin = agencyUser?.role === 'SUPER_ADMIN';
    const isTrialing = agencyUser?.subscriptionStatus === 'TRIALING';
    const isActive = agencyUser?.subscriptionStatus === 'ACTIVE';

    if (!isActive && !isTrialing && !isSuperAdmin) {
      return res.status(403).json({
        error: 'A sua assinatura de agência está inativa ou expirou.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    const delegations = await prisma.agencyDelegation.findMany({
      where: {
        agencyId: req.user.id,
        status: 'ACCEPTED',
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            subscriptionStatus: true,
            mediaKit: {
              select: {
                slug: true,
                profilePicture: true,
                bio: true,
                niche: true,
              },
            },
          },
        },
      },
    });

    const creators = delegations.map((d: any) => ({
      id: d.creator.id,
      name: d.creator.name,
      email: d.creator.email,
      subscriptionStatus: d.creator.subscriptionStatus,
      profilePicture: d.creator.mediaKit?.profilePicture || null,
      mediaKitSlug: d.creator.mediaKit?.slug || null,
      bio: d.creator.mediaKit?.bio || null,
      delegationId: d.id,
    }));

    return res.status(200).json({ creators });
  }

  // 7. Agência desassocia um criador específico
  static async removeCreator(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { creatorId } = req.params;

    const delegation = await prisma.agencyDelegation.findFirst({
      where: {
        agencyId: req.user.id,
        creatorId,
        status: 'ACCEPTED',
      },
    });

    if (!delegation) {
      return res.status(404).json({ error: 'Vínculo com o criador não encontrado.' });
    }

    await prisma.agencyDelegation.delete({
      where: { id: delegation.id },
    });

    return res.status(200).json({ message: 'Criador desassociado com sucesso da agência.' });
  }

  // 8. Influenciador desassocia-se da agência
  static async leaveAgency(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { agencyId } = req.body;

    const whereClause: any = { creatorId: req.user.id, status: 'ACCEPTED' };
    if (agencyId) whereClause.agencyId = agencyId;

    const deleted = await prisma.agencyDelegation.deleteMany({
      where: whereClause,
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Nenhuma associação ativa com agência encontrada.' });
    }

    return res.status(200).json({ message: 'Desassociado da agência com sucesso.' });
  }

  // 9. Influenciador vê os dados e a foto da agência à qual está associado
  static async getMyAgencyDetails(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const delegation = await prisma.agencyDelegation.findFirst({
      where: {
        creatorId: req.user.id,
        status: 'ACCEPTED',
      },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
            email: true,
            mediaKit: {
              select: {
                profilePicture: true,
                bio: true,
                location: true,
              },
            },
          },
        },
      },
    });

    if (!delegation || !delegation.agency) {
      return res.status(404).json({ error: 'Você não está associado a nenhuma agência.' });
    }

    const agencyData: any = delegation.agency;
    const agency = {
      id: agencyData.id,
      name: agencyData.name,
      email: agencyData.email,
      profilePicture: agencyData.mediaKit?.profilePicture || null,
      bio: agencyData.mediaKit?.bio || null,
      location: agencyData.mediaKit?.location || null,
    };

    return res.status(200).json({ agency });
  }

  // 10. Agência atualiza o seu próprio perfil, biografia e foto de perfil
  static async updateAgencyProfile(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { bio, profilePicture } = req.body;

    let imageUrl = profilePicture;

    if (profilePicture && profilePicture.startsWith('data:image')) {
      imageUrl = await CloudinaryService.uploadImage(profilePicture, 'profile');
    }

    const mediaKit = await prisma.mediaKit.upsert({
      where: { userId: req.user.id },
      update: {
        ...(bio !== undefined ? { bio } : {}),
        ...(imageUrl !== undefined ? { profilePicture: imageUrl } : {}),
      },
      create: {
        userId: req.user.id,
        slug: `agency-${req.user.id.slice(0, 8)}`,
        bio: bio || null,
        profilePicture: imageUrl || null,
        isPublic: false,
      },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true },
    });

    return res.status(200).json({
      message: 'Perfil da agência atualizado com sucesso!',
      agency: {
        id: updatedUser?.id,
        email: updatedUser?.email,
        bio: mediaKit.bio,
        profilePicture: mediaKit.profilePicture,
      },
    });
  }

  // 11. Diretório Avançado de Influenciadores (Fase 6.1: Nome, Nicho, Localização, Plataforma, Seguidores e Paginação)
  static async searchInfluencers(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { name, niche, location, platform, minFollowers, maxFollowers, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    try {
      const whereClause: any = {
        role: 'INFLUENCER',
      };

      if (name) {
        whereClause.name = { contains: name as string };
      }

      if (location || niche || platform || minFollowers || maxFollowers) {
        whereClause.mediaKit = {
          is: {
            ...(location ? { location: { contains: location as string } } : {}),
            ...(niche ? { niche: { contains: niche as string } } : {}),
            ...(platform || minFollowers || maxFollowers ? {
              socialNetworks: {
                some: {
                  ...(platform ? { platform: platform as string } : {}),
                  ...(minFollowers || maxFollowers ? {
                    followersCount: {
                      ...(minFollowers ? { gte: parseInt(minFollowers as string, 10) } : {}),
                      ...(maxFollowers ? { lte: parseInt(maxFollowers as string, 10) } : {}),
                    }
                  } : {}),
                }
              }
            } : {}),
          },
        };
      }

      const [influencers, total] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
            mediaKit: {
              select: {
                slug: true,
                profilePicture: true,
                bio: true,
                niche: true,
                location: true,
                socialNetworks: true,
              },
            },
          },
          skip,
          take: limitNum,
        }),
        prisma.user.count({ where: whereClause }),
      ]);

      const formattedInfluencers = influencers.map((inf: any) => ({
        id: inf.id,
        name: inf.name,
        subscriptionStatus: inf.subscriptionStatus,
        profilePicture: inf.mediaKit?.profilePicture || null,
        mediaKitSlug: inf.mediaKit?.slug || null,
        bio: inf.mediaKit?.bio || null,
        niche: inf.mediaKit?.niche || null,
        location: inf.mediaKit?.location || null,
        socialNetworks: inf.mediaKit?.socialNetworks || [],
      }));

      return res.status(200).json({
        data: formattedInfluencers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Erro ao pesquisar influenciadores:', error);
      return res.status(500).json({ error: 'Erro interno ao pesquisar influenciadores.' });
    }
  }

  // 12. Agência visualiza o Mídia Kit detalhado de um influenciador específico
  static async getInfluencerMediaKitDetails(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { influencerId } = req.params;

    const mediaKit = await prisma.mediaKit.findUnique({
      where: { userId: influencerId },
      include: {
        socialNetworks: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!mediaKit) {
      return res.status(404).json({ error: 'Mídia Kit não encontrado para este influenciador.' });
    }

    return res.status(200).json({ mediaKit });
  }

  // 13. Agência busca os dados do seu próprio perfil e foto
  static async getProfile(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    try {
      const agencyUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mediaKit: {
            select: {
              bio: true,
              profilePicture: true,
              location: true,
            },
          },
        },
      });

      if (!agencyUser) {
        return res.status(404).json({ error: 'Utilizador agência não encontrado.' });
      }

      const agency = {
        id: agencyUser.id,
        name: agencyUser.name,
        email: agencyUser.email,
        role: agencyUser.role,
        bio: agencyUser.mediaKit?.bio || '',
        profilePicture: agencyUser.mediaKit?.profilePicture || null,
        location: agencyUser.mediaKit?.location || null,
      };

      return res.status(200).json({ agency });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao buscar perfil da agência.' });
    }
  }
}