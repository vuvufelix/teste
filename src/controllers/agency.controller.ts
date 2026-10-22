import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { NotificationService } from '../services/notification.service.js';

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

    // Busca os dados da agência, incluindo o plano e o status da subscrição
    const agencyUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    if (!agencyUser) {
      return res.status(404).json({ error: 'Utilizador agência não encontrado.' });
    }

    const isSuperAdmin = agencyUser.role === 'SUPER_ADMIN';
    const isTrialing = agencyUser.subscriptionStatus === 'TRIALING';
    const isActive = agencyUser.subscriptionStatus === 'ACTIVE';

    // 🔒 Verificação de Assinatura da Agência
    if (!isActive && !isTrialing && !isSuperAdmin) {
      return res.status(403).json({
        error: 'A sua assinatura de agência está inativa ou expirou. Assine o Plano Agência para gerir criadores.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    // 📏 Validação de Plano: Garante que a agência está no Plano Agência (slug: 'agency') ou em Trial/Admin
    if (!isSuperAdmin && !isTrialing && agencyUser.plan?.slug !== 'agency') {
      return res.status(403).json({
        error: 'O seu plano atual não permite a gestão de múltiplos criadores. Faça upgrade para o Plano Agência.',
        code: 'AGENCY_PLAN_REQUIRED',
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

    await NotificationService.sendPushToUser(creator.id, {
      title: 'Novo Convite de Agência! 🚀',
      body: `${agencyUser.name} convidou-o para gerir a sua conta.`,
      url: '/dashboard/invites',
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

    // Formata para injetar a profilePicture da agência de forma limpa
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

  // 5. Criador aceita ou recusa o convite da agência
  static async respondToInvite(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    
    const { delegationId } = req.params;
    const { status } = req.body; // Esperado: 'ACCEPTED' ou 'REVOKED' (ou REJECTED)

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

  // 6. Agência lista todos os criadores com delegação ativa (ACCEPTED) com foto do Media Kit
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

    const { agencyId } = req.body; // Opcional se houver mais do que uma agência

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
}