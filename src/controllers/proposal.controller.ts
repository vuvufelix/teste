import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createProposalSchema, updateProposalStatusSchema } from '../schemas/proposal.schema.js';
import { PDFService } from '../services/pdf.service.js';

export class ProposalController {
  // Criar Proposta Comercial
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

    // Regra de Negócio: Limite de Propostas do Plano
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    if (user?.plan && user.plan.maxProposalsPerMonth !== -1) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const proposalsCount = await prisma.proposal.count({
        where: {
          userId: req.user.id,
          createdAt: { gte: firstDayOfMonth },
        },
      });

      if (proposalsCount >= user.plan.maxProposalsPerMonth) {
        return res.status(403).json({
          error: `Seu plano atual permite gerar no máximo ${user.plan.maxProposalsPerMonth} propostas por mês. Faça upgrade do seu plano para propostas ilimitadas.`,
          code: 'PROPOSAL_LIMIT_REACHED',
        });
      }
    }

    // Cálculo do valor total
    const processedItems = items.map((item) => ({
      deliverable: item.deliverable,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const totalAmount = processedItems.reduce((acc, item) => acc + item.totalPrice, 0);

    const proposal = await prisma.proposal.create({
      data: {
        userId: req.user.id,
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

  // Listar todas as propostas do usuário
  static async getMyProposals(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const proposals = await prisma.proposal.findMany({
      where: { userId: req.user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ proposals });
  }

  // Obter detalhes de uma proposta específica
  static async getProposalById(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { id, userId: req.user.id },
      include: { items: true },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta comercial não encontrada.' });
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

    const proposal = await prisma.proposal.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: { status: parseResult.data.status },
      include: { items: true },
    });

    return res.status(200).json({ proposal: updatedProposal });
  }

  // Renderizar PDF/HTML da Proposta Comercial
  static async renderProposalPDF(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { id, userId: req.user.id },
      include: {
        items: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
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

    const proposal = await prisma.proposal.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    await prisma.proposal.delete({ where: { id } });

    return res.status(200).json({ message: 'Proposta comercial excluída com sucesso.' });
  }

  /**
   * Gera e faz o download direto do PDF da Proposta Comercial
   */
  static async downloadProposalPDF(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      // 1. Busca a proposta no banco com os itens e o criador
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

      // Regra de segurança: garante que a proposta pertence ao usuário autenticado
      if (req.user && proposal.userId !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Acesso negado a esta proposta.' });
      }

      // 2. Prepara os dados formatados para o PDFService
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

      // 3. Gera o Buffer do PDF usando Puppeteer
      const pdfBuffer = await PDFService.generateProposalPDFBuffer(pdfData);

      // 4. Configura as Headers do Express para o download no navegador
      const fileName = `Proposta_Influkit_${proposal.brandName.replace(/\s+/g, '_')}_${proposal.id.substring(0, 8)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // 5. Envia o Buffer binário direto para a resposta
      return res.end(pdfBuffer);
    } catch (error) {
      console.error('Erro ao gerar PDF da proposta:', error);
      return res.status(500).json({ error: 'Erro ao gerar o arquivo PDF.' });
    }
  }
}