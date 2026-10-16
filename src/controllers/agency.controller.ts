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
    const isTrialing = agencyUser.subscriptionStatus === 'TRIALING'
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

    // Correção: O enum Role no Prisma utiliza 'CREATOR'
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

  // 2. Criador lista os convites pendentes que recebeu de agências
  static async getMyPendingInvites(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const invites = await prisma.agencyDelegation.findMany({
      where: {
        creatorId: req.user.id,
        status: 'PENDING',
      },
      include: {
        agency: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json({ invites });
  }

  // 3. Criador aceita ou recusa o convite da agência
  static async respondToInvite(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    
    const { delegationId } = req.params;
    const { status } = req.body; // Esperado: 'ACCEPTED' ou 'REVOKED'

    if (!['ACCEPTED', 'REVOKED'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use ACCEPTED ou REVOKED.' });
    }

    const delegation = await prisma.agencyDelegation.findUnique({
      where: { id: delegationId },
    });

    if (!delegation || delegation.creatorId !== req.user.id) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    const updatedDelegation = await prisma.agencyDelegation.update({
      where: { id: delegationId },
      data: { status },
    });

    await NotificationService.sendPushToUser(delegation.agencyId, {
        title: 'Convite Aceite! 🎉',
        body: `${req.user.id} aceitou a sua solicitação de delegação.`,
        url: '/agency/creators',
    });

    return res.status(200).json({
      message: `Convite ${status === 'ACCEPTED' ? 'aceite' : 'rejeitado'} com sucesso.`,
      delegation: updatedDelegation,
    });
  }

  // 4. Agência lista todos os criadores com delegação ativa (ACCEPTED)
  static async getMyManagedCreators(req: AuthenticatedRequest, res: Response) {
    if (!req.user || req.user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Acesso negado. Apenas agências podem consultar esta lista.' });
    }

    const agencyUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    const isSuperAdmin = agencyUser?.role === 'SUPER_ADMIN';
    const isTrialing = agencyUser?.subscriptionStatus === 'TRIALING'
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
              include: { socialNetworks: true },
            },
          },
        },
      },
    });

    const creators = delegations.map((d) => d.creator);

    return res.status(200).json({ creators });
  }
}