import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createProposalSchema, updateProposalStatusSchema } from '../schemas/proposal.schema.js';
import { PDFService } from '../services/pdf.service.js';
import { AIService } from "../services/ai.service.js";
import { MailService } from "../services/mail.service.js";
import { NotificationService } from '../services/notification.service.js';

export class ProposalController {
  
  // 🔒 Helper privado para verificar se a agência tem acesso ao criador da proposta ou se é o próprio utilizador
  private static async verifyProposalAccess(userId: string, userRole: string, proposalUserId: string) {
    if (userId === proposalUserId) return true;
    if (userRole === 'SUPER_ADMIN') return true;
    
    if (userRole === 'AGENCY') {
      const delegation = await prisma.agencyDelegation.findUnique({
        where: {
          agencyId_creatorId: {
            agencyId: userId,
            creatorId: proposalUserId,
          },
        },
      });
      return delegation && delegation.status === 'ACCEPTED';
    }

    return false;
  }

  // 📋 Obter IDs permitidos para listagem (Próprio utilizador + Criadores delegados se for agência)
  private static async getAllowedUserIds(user: { id: string; role: string }): Promise<string[]> {
    if (user.role === 'SUPER_ADMIN') {
      // Se for super admin, pode ver tudo ou ajustar conforme regra. Aqui focamos em agency/creator.
      return [user.id];
    }

    if (user.role === 'AGENCY') {
      const delegations = await prisma.agencyDelegation.findMany({
        where: { agencyId: user.id, status: 'ACCEPTED' },
        select: { creatorId: true },
      });
      return [user.id, ...delegations.map((d) => d.creatorId)];
    }

    return [user.id];
  }

  // Criar Proposta Comercial (Com suporte a Agências e Delegação)
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
    const requestedCreatorId = (req.headers['x-target-creator-id'] as string) || req.body.creatorId;

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
        return res.status(403).json({
          error: 'Não tem permissão de gestão ativa para este criador.',
          code: 'DELEGATION_NOT_AUTHORIZED',
        });
      }

      targetUserId = requestedCreatorId;
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { plan: true },
    });

    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isTrialing = user.subscriptionStatus === 'TRIALING';
    const isActive = user.subscriptionStatus === 'ACTIVE';

    if (!isActive && !isTrialing && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Sua assinatura está inativa ou expirou. Assine um plano para criar novas propostas.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    if (!isTrialing && !isSuperAdmin && user.plan && user.plan.maxProposalsPerMonth !== -1) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const proposalsCount = await prisma.proposal.count({
        where: {
          userId: targetUserId,
          createdAt: { gte: firstDayOfMonth },
        },
      });

      if (proposalsCount >= user.plan.maxProposalsPerMonth) {
        return res.status(403).json({
          error: `O plano atual permite gerar no máximo ${user.plan.maxProposalsPerMonth} propostas por mês. Faça upgrade do seu plano para propostas ilimitadas.`,
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

    const proposal = await prisma.proposal.create({
      data: {
        userId: targetUserId,
        brandName,
        brandEmail,
        title,
        description,
        currency,
        totalAmount,
        validUntil: new Date(validUntil),
        items: {
          create: processedItems,
        },
      },
      include: { items: true },
    });

    return res.status(201).json({ proposal });
  }

  // Listar todas as propostas do usuário (e criadores delegados se for agência)
  static async getMyProposals(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const allowedUserIds = await ProposalController.getAllowedUserIds(req.user);

    const proposals = await prisma.proposal.findMany({
      where: { userId: { in: allowedUserIds } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ proposals });
  }

  // Obter detalhes de uma proposta específica
  static async getProposalById(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta comercial não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    return res.status(200).json({ proposal });
  }

  // Atualizar Status da Proposta
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

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: { status: parseResult.data.status },
      include: { items: true },
    });

    await NotificationService.sendPushToUser(proposal.userId, {
      title: 'Status de Proposta Atualizado! 📄',
      body: `A proposta para "${proposal.brandName}" mudou para ${updatedProposal.status}.`,
      url: `/proposals/${proposal.id}`,
    });

    return res.status(200).json({ proposal: updatedProposal });
  }

  // Renderizar PDF/HTML da Proposta Comercial
  static async renderProposalPDF(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        items: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

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
      creatorName: proposal.user.name,
      creatorEmail: proposal.user.email,
      items: proposal.items,
    });

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
  }

  // Excluir Proposta
  static async deleteProposal(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
    }

    await prisma.proposal.delete({ where: { id } });

    return res.status(200).json({ message: 'Proposta comercial excluída com sucesso.' });
  }

  // Gera e faz o download direto do PDF da Proposta Comercial
  static async downloadProposalPDF(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;

      const proposal = await prisma.proposal.findUnique({
        where: { id },
        include: {
          items: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
      }

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
        creatorName: proposal.user.name,
        creatorEmail: proposal.user.email,
        items: proposal.items.map((item) => ({
          deliverable: item.deliverable,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      };

      const pdfBuffer = await PDFService.generateProposalPDFBuffer(pdfData);
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

  // Gerar texto da proposta com IA (Gemini)
  static async generateAIProposalText(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { brandName, proposalTitle } = req.body;
    if (!brandName || !proposalTitle) {
      return res.status(400).json({ error: 'Informe o nome da marca e o título da proposta.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { 
        plan: true, 
        mediaKit: true 
      },
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

  // Envia a proposta comercial em PDF por e-mail para a marca
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
        },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      const hasAccess = await ProposalController.verifyProposalAccess(req.user.id, req.user.role, proposal.userId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
      }

      if (!proposal.brandEmail) {
        return res.status(400).json({ error: 'Esta proposta não possui um e-mail de marca associado.' });
      }

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
        creatorName: proposal.user.name,
        creatorEmail: proposal.user.email,
        items: proposal.items.map((item) => ({
          deliverable: item.deliverable,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      };

      const pdfBuffer = await PDFService.generateProposalPDFBuffer(pdfData);

      await MailService.sendCustomProposalEmail({
        brandEmail: proposal.brandEmail,
        brandName: proposal.brandName,
        proposalTitle: proposal.title,
        creatorName: proposal.user.name || 'Criador de Conteúdo',
        creatorEmail: proposal.user.email, 
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