import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createProposalSchema, updateProposalStatusSchema } from '../schemas/proposal.schema.js';
import { PDFService } from '../services/pdf.service.js';
import { AIService } from "../services/ai.service.js";
import { MailService } from "../services/mail.service.js";
import { NotificationService } from '../services/notification.service.js';

export class ProposalController {
  
  // Helper privado para verificar se o utilizador tem acesso à proposta
  private static async verifyProposalAccess(userId: string, userRole: string, proposalUserId: string, creatorId?: string | null) {
    if (userId === proposalUserId) return true;
    if (creatorId && userId === creatorId) return true;
    if (userRole === 'SUPER_ADMIN') return true;
    
    if (userRole === 'AGENCY') {
      if (proposalUserId === userId) return true;

      if (creatorId) {
        const delegation = await prisma.agencyDelegation.findUnique({
          where: {
            agencyId_creatorId: {
              agencyId: userId,
              creatorId: creatorId,
            },
          },
        });
        return delegation && delegation.status === 'ACCEPTED';
      }
    }

    return false;
  }

  // 📋 Obter IDs permitidos para listagem no painel
  private static async getAllowedUserIds(user: { id: string; role: string }): Promise<string[]> {
    if (user.role === 'SUPER_ADMIN') {
      return []; // ou lógica global
    }

    if (user.role === 'AGENCY') {
      // A agência vê propostas criadas por ela própria
      return [user.id];
    }

    return [user.id];
  }

  // Criar Proposta Comercial (Fase 7: Suporte a Influenciador Direto e Agência com Representação e Snapshots)
  static async createProposal(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = createProposalSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados da proposta.',
        details: parseResult.error.format(),
      });
    }

    const { brandName, brandEmail, title, description, currency, validUntil, items } = parseResult.data;

    let targetUserId = req.user.id;
    let representedCreatorId: string | null = null;
    let agencySnapshot = null;

    const requestedCreatorId = (req.headers['x-target-creator-id'] as string) || req.body.creatorId;

    if (req.user.role === 'AGENCY') {
      if (!requestedCreatorId) {
        return res.status(400).json({ error: 'A agência deve especificar o ID do influenciador representado (creatorId).' });
      }

      const delegation = await prisma.agencyDelegation.findUnique({
        where: {
          agencyId_creatorId: {
            agencyId: req.user.id,
            creatorId: requestedCreatorId,
          },
        },
      });

      if (!delegation || delegation.status !== 'ACCEPTED') {
        return res.status(403).json({
          error: 'Não tem permissão de gestão ativa para este criador.',
          code: 'DELEGATION_NOT_AUTHORIZED',
        });
      }

      targetUserId = requestedCreatorId;
      representedCreatorId = requestedCreatorId;

      //  Obter Snapshot Histórico da Agência
      const agencyUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { mediaKit: true },
      });

      agencySnapshot = {
        name: agencyUser?.name,
        email: agencyUser?.email,
        bio: agencyUser?.mediaKit?.bio,
        profilePicture: agencyUser?.mediaKit?.profilePicture,
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { 
        plan: true,
        mediaKit: {
          include: { socialNetworks: true }
        }
      },
    });

    if (!user) return res.status(404).json({ error: 'Utilizador/Criador não encontrado.' });

    const authorUser = req.user.role === 'AGENCY' 
      ? await prisma.user.findUnique({ where: { id: req.user.id }, include: { plan: true } }) 
      : user;

    if (!authorUser) return res.status(404).json({ error: 'Autor não encontrado.' });

    const isSuperAdmin = authorUser.role === 'SUPER_ADMIN';
    const isTrialing = authorUser.subscriptionStatus === 'TRIALING';
    const isActive = authorUser.subscriptionStatus === 'ACTIVE';

    if (!isActive && !isTrialing && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Sua assinatura está inativa ou expirou. Assine um plano para criar novas propostas.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    if (!isTrialing && !isSuperAdmin && authorUser.plan && authorUser.plan.maxProposalsPerMonth !== -1) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const proposalsCount = await prisma.proposal.count({
        where: {
          userId: req.user.id,
          createdAt: { gte: firstDayOfMonth },
        },
      });

      if (proposalsCount >= authorUser.plan.maxProposalsPerMonth) {
        return res.status(403).json({
          error: `O plano atual permite gerar no máximo ${authorUser.plan.maxProposalsPerMonth} propostas por mês. Faça upgrade do seu plano para propostas ilimitadas.`,
          code: 'PROPOSAL_LIMIT_REACHED',
        });
      }
    }

    const processedItems = items.map((item) => ({
      deliverable: item.deliverable,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const totalAmount = processedItems.reduce((acc, item) => acc + item.totalPrice, 0);

    // 🚀 Snapshot Rígido, Transparente e Contextualizado (Fase 10.1 & 10.3)
    let metricsSnapshot = null;
    const networksToProcess = user.mediaKit?.socialNetworks || [];

    if (networksToProcess.length > 0) {
      const totalFollowers = networksToProcess.reduce((acc, net) => acc + (net.followersCount || 0), 0);
      const totalMonthlyViews = networksToProcess.reduce((acc, net) => acc + (net.monthlyViews || 0), 0);
      
      // Média de engajamento apenas das redes que possuem taxa superior a 0
      const validEngagementNetworks = networksToProcess.filter(net => net.engagementRate > 0);
      const avgEngagement = validEngagementNetworks.length > 0
        ? validEngagementNetworks.reduce((acc, net) => acc + net.engagementRate, 0) / validEngagementNetworks.length
        : 0;

      // 🔒 Transparência rigorosa: Só indica verificação se houver pelo menos uma rede sincronizada via API com sucesso
      const hasAutomatedVerifiedData = networksToProcess.some(
        (net: any) => net.source === 'AUTOMATED' && net.syncStatus === 'SUCCESS'
      );

      metricsSnapshot = {
        totalFollowers: totalFollowers > 0 ? totalFollowers.toLocaleString('pt-PT') : '0',
        totalMonthlyViews: totalMonthlyViews > 0 ? totalMonthlyViews.toLocaleString('pt-PT') : 'Não disponível',
        engagementRate: avgEngagement > 0 ? `${avgEngagement.toFixed(1)}%` : 'Não aplicável',
        networksCount: networksToProcess.length,
        isVerified: hasAutomatedVerifiedData, // Evita falso positivo em dados puramente manuais
        analysisPeriod: 'Dados declarados / Sincronizados ativamente',
        networksList: networksToProcess.map((net: any) => ({
          platform: net.platform,
          handle: net.handle || net.username || undefined,
          followers: net.followersCount || 0,
          source: net.source || 'MANUAL', // Origem transparente (MANUAL ou AUTOMATED)
          status: net.syncStatus || 'SUCCESS', // Estado da sincronização
        })),
      };
    }

    const proposalOwnerId = req.user.role === 'AGENCY' ? req.user.id : targetUserId;

    const proposal = await prisma.proposal.create({
      data: {
        userId: proposalOwnerId,
        creatorId: representedCreatorId, // 🚀 Guardado para rastreio exato da identidade do influenciador
        brandName,
        brandEmail,
        title,
        description,
        currency,
        totalAmount,
        validUntil: new Date(validUntil),
        paymentTerms: req.body.paymentTerms || '50% na aprovação e 50% após entrega final.',
        deliveryDeadline: req.body.deliveryDeadline || 'Conforme alinhamento do briefing.',
        revisionPolicy: req.body.revisionPolicy || 'Inclui até 2 rodadas de revisões antes da publicação.',
        metricsSnapshot: metricsSnapshot ? JSON.parse(JSON.stringify(metricsSnapshot)) : undefined,
        agencySnapshot: agencySnapshot ? JSON.parse(JSON.stringify(agencySnapshot)) : undefined, // 🚀 Snapshot da Agência
        items: {
          create: processedItems,
        },
      },
      include: { items: true, creator: { select: { name: true, email: true } } },
    });

    return res.status(201).json({ proposal });
  }

  static async getMyProposals(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const allowedUserIds = await ProposalController.getAllowedUserIds(req.user);

    const proposals = await prisma.proposal.findMany({
      where: {
        OR: [
          { userId: { in: allowedUserIds } },
          { creatorId: req.user.id },
        ],
      },
      include: { 
        items: true,
        user: { select: { name: true, email: true } },
        creator: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ proposals });
  }

  static async getProposalById(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: { 
        items: true,
        user: { select: { name: true, email: true } },
        creator: { select: { name: true, email: true } },
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta comercial não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    return res.status(200).json({ proposal });
  }

  static async updateStatus(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const parseResult = updateProposalStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Status inválido fornecido.' });
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: { status: parseResult.data.status },
      include: { items: true },
    });

    return res.status(200).json({ proposal: updatedProposal });
  }

  static async renderProposalPDF(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        items: true,
        user: { select: { name: true, email: true } },
        creator: { select: { name: true, email: true } },
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    // 🚀 Obter as definições de personalização de PDF do utilizador (Fase 9)
    const pdfSettings = await prisma.pdfCustomizationSettings.findUnique({
      where: { userId: req.user.id },
    });

    const customizationOptions = pdfSettings ? {
      logoUrl: pdfSettings.logoUrl,
      primaryColor: pdfSettings.primaryColor,
      secondaryColor: pdfSettings.secondaryColor,
      templateStyle: pdfSettings.templateStyle,
      customHeader: pdfSettings.customHeader,
      customFooter: pdfSettings.customFooter,
      hideWatermark: pdfSettings.hideWatermark,
    } : undefined;

    // Identidade correta para o PDF considerando a agência e o criador representado
    const agencyData = proposal.agencySnapshot as any;
    const creatorName = proposal.creator ? proposal.creator.name : proposal.user.name;
    const creatorEmail = proposal.creator ? proposal.creator.email : proposal.user.email;

    const htmlContent = PDFService.generateProposalHTML({
      id: proposal.id,
      title: proposal.title,
      brandName: proposal.brandName,
      brandEmail: proposal.brandEmail,
      description: proposal.description,
      currency: proposal.currency,
      totalAmount: proposal.totalAmount,
      validUntil: proposal.validUntil,
      createdAt: proposal.createdAt,
      creatorName,
      creatorEmail,
      agencyName: agencyData?.name || undefined,
      paymentTerms: proposal.paymentTerms,
      deliveryDeadline: proposal.deliveryDeadline,
      revisionPolicy: proposal.revisionPolicy,
      cancellationTerms: proposal.cancellationTerms,
      metricsSnapshot: proposal.metricsSnapshot as any,
      items: proposal.items,
    }, customizationOptions); // 🚀 Opções passadas aqui

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
  }

  static async deleteProposal(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    await prisma.proposal.delete({ where: { id } });

    return res.status(200).json({ message: 'Proposta comercial excluída com sucesso.' });
  }

  static async downloadProposalPDF(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;

      const proposal = await prisma.proposal.findUnique({
        where: { id },
        include: {
          items: true,
          user: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
        },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
      }

      // 🚀 Obter as definições de personalização de PDF do utilizador (Fase 9)
      const pdfSettings = await prisma.pdfCustomizationSettings.findUnique({
        where: { userId: req.user.id },
      });

      const customizationOptions = pdfSettings ? {
        logoUrl: pdfSettings.logoUrl,
        primaryColor: pdfSettings.primaryColor,
        secondaryColor: pdfSettings.secondaryColor,
        templateStyle: pdfSettings.templateStyle,
        customHeader: pdfSettings.customHeader,
        customFooter: pdfSettings.customFooter,
        hideWatermark: pdfSettings.hideWatermark,
      } : undefined;

      const agencyData = proposal.agencySnapshot as any;
      const creatorName = proposal.creator ? proposal.creator.name : proposal.user.name;
      const creatorEmail = proposal.creator ? proposal.creator.email : proposal.user.email;

      const pdfData = {
        id: proposal.id,
        title: proposal.title,
        brandName: proposal.brandName,
        brandEmail: proposal.brandEmail,
        description: proposal.description,
        currency: proposal.currency,
        totalAmount: proposal.totalAmount,
        validUntil: proposal.validUntil,
        createdAt: proposal.createdAt,
        creatorName,
        creatorEmail,
        agencyName: agencyData?.name || undefined,
        paymentTerms: proposal.paymentTerms,
        deliveryDeadline: proposal.deliveryDeadline,
        revisionPolicy: proposal.revisionPolicy,
        cancellationTerms: proposal.cancellationTerms,
        metricsSnapshot: proposal.metricsSnapshot as any,
        items: proposal.items.map((item) => ({
          deliverable: item.deliverable,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      };

      const pdfBuffer = await PDFService.generateProposalPDFBuffer(pdfData, customizationOptions); // 🚀 Opções passadas aqui
      const fileName = `Proposta_Influkit_${proposal.brandName.replace(/\s+/g, '_')}_${proposal.id.substring(0, 8)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.end(pdfBuffer);
    } catch (error) {
      console.error('Erro ao gerar PDF da proposta:', error);
      return res.status(500).json({ error: 'Erro ao gerar o arquivo PDF.' });
    }
  }

  static async generateAIProposalText(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { brandName, proposalTitle } = req.body;
    if (!brandName || !proposalTitle) {
      return res.status(400).json({ error: 'Informe o nome da marca e o título da proposta.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true, mediaKit: true },
    });

    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isTrialing = user.subscriptionStatus === 'TRIALING';

    if (!isSuperAdmin && !isTrialing && (!user.plan || !user.plan.hasAIAssistant)) {
      return res.status(403).json({
        error: 'A geração de propostas com Inteligência Artificial é exclusiva dos planos Pro e Agência. Faça um upgrade para desbloquear.',
        code: 'AI_FEATURE_LOCKED',
      });
    }

    const isAgency = user.role === 'AGENCY';
    const creatorName = user.name || (isAgency ? 'Agência de Talentos' : 'Criador de Conteúdo');
    const niche = user.mediaKit?.niche || 'Marketing de Influência';

    try {
      const aiMessage = await AIService.generateProposalMessage({
        creatorName,
        brandName,
        niche,
        proposalTitle,
        isAgency,
      });

      return res.status(200).json({ message: 'Texto gerado com sucesso!', aiMessage });
    } catch (error) {
      console.error('Erro ao gerar texto com IA:', error);
      return res.status(500).json({ error: 'Erro ao gerar texto com Inteligência Artificial.' });
    }
  }

  static async sendProposalEmail(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;
    const { customMessage } = req.body;

    try {
      const proposal = await prisma.proposal.findUnique({
        where: { id },
        include: {
          items: true,
          user: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
        },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId, proposal.creatorId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
      }

      if (!proposal.brandEmail) {
        return res.status(400).json({ error: 'Esta proposta não possui um e-mail de marca associado.' });
      }

      // 🚀 Obter as definições de personalização de PDF do utilizador (Fase 9)
      const pdfSettings = await prisma.pdfCustomizationSettings.findUnique({
        where: { userId: req.user.id },
      });

      const customizationOptions = pdfSettings ? {
        logoUrl: pdfSettings.logoUrl,
        primaryColor: pdfSettings.primaryColor,
        secondaryColor: pdfSettings.secondaryColor,
        templateStyle: pdfSettings.templateStyle,
        customHeader: pdfSettings.customHeader,
        customFooter: pdfSettings.customFooter,
        hideWatermark: pdfSettings.hideWatermark,
      } : undefined;

      const agencyData = proposal.agencySnapshot as any;
      const creatorName = proposal.creator ? proposal.creator.name : proposal.user.name;
      const creatorEmail = proposal.creator ? proposal.creator.email : proposal.user.email;

      const pdfData = {
        id: proposal.id,
        title: proposal.title,
        brandName: proposal.brandName,
        brandEmail: proposal.brandEmail,
        description: proposal.description,
        currency: proposal.currency,
        totalAmount: proposal.totalAmount,
        validUntil: proposal.validUntil,
        createdAt: proposal.createdAt,
        creatorName,
        creatorEmail,
        agencyName: agencyData?.name || undefined,
        paymentTerms: proposal.paymentTerms,
        deliveryDeadline: proposal.deliveryDeadline,
        revisionPolicy: proposal.revisionPolicy,
        cancellationTerms: proposal.cancellationTerms,
        metricsSnapshot: proposal.metricsSnapshot as any,
        items: proposal.items.map((item) => ({
          deliverable: item.deliverable,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      };

      const pdfBuffer = await PDFService.generateProposalPDFBuffer(pdfData, customizationOptions); // 🚀 Opções passadas aqui

      await MailService.sendCustomProposalEmail({
        brandEmail: proposal.brandEmail,
        brandName: proposal.brandName,
        proposalTitle: proposal.title,
        creatorName: creatorName || 'Criador de Conteúdo',
        creatorEmail: creatorEmail, 
        customMessage: customMessage || 'Segue em anexo a nossa proposta comercial detalhada.',
        pdfBuffer,
      });

      await prisma.proposal.update({
        where: { id },
        data: { status: 'SENT' },
      });

      return res.status(200).json({ message: 'Proposta comercial enviada com sucesso para a marca!' });
    } catch (error) {
      console.error('Erro ao enviar proposta por e-mail:', error);
      return res.status(500).json({ error: 'Erro ao enviar a proposta por e-mail.' });
    }
  }
}