import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createContractSchema, updateContractStatusSchema } from '../schemas/contract.schema.js';
import { PDFService } from '../services/pdf.service.js';
import { MailService } from '../services/mail.service.js';

export class ContractController {
  
  // 🔒 Helper de autorização estrita para acesso a contratos
  private static async verifyContractAccess(userId: string, userRole: string, contractUserId: string, creatorId?: string | null) {
    if (userId === contractUserId) return true;
    if (creatorId && userId === creatorId) return true;
    if (userRole === 'SUPER_ADMIN') return true;
    
    if (userRole === 'AGENCY') {
      if (contractUserId === userId) return true;

      if (creatorId) {
        const delegation = await prisma.agencyDelegation.findUnique({
          where: {
            agencyId_creatorId: {
              agencyId: userId,
              creatorId,
            },
          },
        });
        return delegation && delegation.status === 'ACCEPTED';
      }
    }

    return false;
  }

  /**
   * 8.1 & 8.2. Criar Novo Contrato Comercial
   */
  static async createContract(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = createContractSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados do contrato.',
        details: parseResult.error.format(),
      });
    }

    const {
      contractType,
      title,
      brandName,
      brandEmail,
      totalAmount,
      currency,
      servicesDescription,
      paymentTerms,
      deliveryDeadline,
      revisionCount,
      cancellationTerms,
      contentUsageRights,
      usageDuration,
      isExclusive,
      exclusivityTerms,
      validUntil,
      creatorId,
    } = parseResult.data;

    let targetCreatorId: string | null = null;
    let agencySnapshot = null;

    // Se for uma Agência a criar para um Influenciador
    if (req.user.role === 'AGENCY') {
      if (!creatorId) {
        return res.status(400).json({ error: 'A agência deve especificar o ID do influenciador representado (creatorId).' });
      }

      const delegation = await prisma.agencyDelegation.findUnique({
        where: {
          agencyId_creatorId: {
            agencyId: req.user.id,
            creatorId,
          },
        },
      });

      if (!delegation || delegation.status !== 'ACCEPTED') {
        return res.status(403).json({
          error: 'Não possui uma delegação ativa para criar um contrato em nome deste criador.',
          code: 'DELEGATION_NOT_AUTHORIZED',
        });
      }

      targetCreatorId = creatorId;

      const agencyUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { mediaKit: true },
      });

      agencySnapshot = {
        name: agencyUser?.name,
        email: agencyUser?.email,
        profilePicture: agencyUser?.mediaKit?.profilePicture,
      };
    } else {
      // Influenciador direto
      targetCreatorId = req.user.id;
    }

    const contractOwnerId = req.user.role === 'AGENCY' ? req.user.id : targetCreatorId;

    const contract = await prisma.contract.create({
      data: {
        userId: contractOwnerId,
        creatorId: req.user.role === 'AGENCY' ? targetCreatorId : null,
        contractType,
        title,
        brandName,
        brandEmail,
        totalAmount,
        currency,
        servicesDescription,
        paymentTerms: paymentTerms || '50% no início e 50% após homologação.',
        deliveryDeadline,
        revisionCount: revisionCount ?? 2,
        cancellationTerms,
        contentUsageRights: contentUsageRights || 'Uso em redes sociais e canais digitais.',
        usageDuration: usageDuration || '12 meses',
        isExclusive: Boolean(isExclusive),
        exclusivityTerms,
        validUntil: validUntil ? new Date(validUntil) : null,
        status: 'DRAFT',
        agencySnapshot: agencySnapshot ? JSON.parse(JSON.stringify(agencySnapshot)) : undefined,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({
      message: 'Contrato comercial criado com sucesso!',
      contract,
    });
  }

  /**
   * 8.2. Listar Contratos Permitidos
   */
  static async getMyContracts(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const whereClause: any = {};

    if (req.user.role === 'AGENCY') {
      whereClause.userId = req.user.id;
    } else {
      whereClause.OR = [
        { userId: req.user.id },
        { creatorId: req.user.id },
      ];
    }

    const contracts = await prisma.contract.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ contracts });
  }

  /**
   * Obter Detalhes de um Contrato por ID
   */
  static async getContractById(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contrato comercial não encontrado.' });
    }

    const hasAccess = await ContractController.verifyContractAccess(
      req.user.id,
      req.user.role,
      contract.userId,
      contract.creatorId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a este contrato.' });
    }

    return res.status(200).json({ contract });
  }

  /**
   * 8.3 & 8.5. Atualizar Ciclo de Vida do Contrato (Transições e Auditoria Imutável)
   */
  static async updateStatus(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const parseResult = updateContractStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Estado de contrato inválido.' });
    }

    const { status: newStatus } = parseResult.data;

    const contract = await prisma.contract.findUnique({ where: { id } });

    if (!contract) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }

    const hasAccess = await ContractController.verifyContractAccess(
      req.user.id,
      req.user.role,
      contract.userId,
      contract.creatorId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    // Regra da Fase 8.5: Se o contrato já foi aceite ou assinado, não pode ser alterado silenciosamente
    if (['ACCEPTED', 'SIGNED', 'COMPLETED'].includes(contract.status) && ['DRAFT', 'PREPARATION'].includes(newStatus)) {
      return res.status(400).json({
        error: 'Não é possível retroceder o estado de um contrato já aceite ou assinado. Crie um novo documento ou adenda.',
      });
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'SIGNED' && !contract.signedAt) {
      updateData.signedAt = new Date();
    }

    const updatedContract = await prisma.contract.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      message: `Estado do contrato atualizado para ${newStatus} com sucesso.`,
      contract: updatedContract,
    });
  }

  /**
   * Eliminar Contrato Comercial (Apenas em Rascunho/Preparação)
   */
  static async deleteContract(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({ where: { id } });

    if (!contract) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }

    const hasAccess = await ContractController.verifyContractAccess(
      req.user.id,
      req.user.role,
      contract.userId,
      contract.creatorId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (['ACCEPTED', 'SIGNED', 'COMPLETED'].includes(contract.status)) {
      return res.status(400).json({
        error: 'Contratos já formalizados ou assinados não podem ser eliminados da base de dados por razões de auditoria.',
      });
    }

    await prisma.contract.delete({ where: { id } });

    return res.status(200).json({ message: 'Contrato eliminado com sucesso.' });
  }

  /**
   * 8.4 & 9. Renderizar Contrato em HTML/PDF (Visualização Privada com Personalização)
   */
  static async renderContractPDF(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        creator: { select: { name: true, email: true } },
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }

    const hasAccess = await ContractController.verifyContractAccess(
      req.user.id,
      req.user.role,
      contract.userId,
      contract.creatorId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado a este contrato.' });
    }

    // 🚀 Obter definições de personalização de PDF do utilizador (Fase 9)
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

    const agencyData = contract.agencySnapshot as any;
    const creatorName = contract.creator ? contract.creator.name : contract.user.name;
    const creatorEmail = contract.creator ? contract.creator.email : contract.user.email;

    const htmlContent = PDFService.generateContractHTML({
      id: contract.id,
      title: contract.title,
      contractType: contract.contractType,
      brandName: contract.brandName,
      brandEmail: contract.brandEmail,
      totalAmount: contract.totalAmount,
      currency: contract.currency,
      status: contract.status,
      servicesDescription: contract.servicesDescription,
      paymentTerms: contract.paymentTerms,
      deliveryDeadline: contract.deliveryDeadline,
      revisionCount: contract.revisionCount,
      cancellationTerms: contract.cancellationTerms,
      contentUsageRights: contract.contentUsageRights,
      usageDuration: contract.usageDuration,
      isExclusive: contract.isExclusive,
      exclusivityTerms: contract.exclusivityTerms,
      validUntil: contract.validUntil,
      signedAt: contract.signedAt,
      createdAt: contract.createdAt,
      creatorName,
      creatorEmail,
      agencyName: agencyData?.name || undefined,
    }, customizationOptions); // 🚀 Opções passadas aqui

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
  }

  /**
   * 8.4 & 9. Descarregar Contrato em PDF
   */
  static async downloadContractPDF(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          user: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
        },
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const hasAccess = await ContractController.verifyContractAccess(
        req.user.id,
        req.user.role,
        contract.userId,
        contract.creatorId
      );

      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a este contrato.' });
      }

      // 🚀 Obter definições de personalização de PDF do utilizador (Fase 9)
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

      const agencyData = contract.agencySnapshot as any;
      const creatorName = contract.creator ? contract.creator.name : contract.user.name;
      const creatorEmail = contract.creator ? contract.creator.email : contract.user.email;

      const pdfData = {
        id: contract.id,
        title: contract.title,
        contractType: contract.contractType,
        brandName: contract.brandName,
        brandEmail: contract.brandEmail,
        totalAmount: contract.totalAmount,
        currency: contract.currency,
        status: contract.status,
        servicesDescription: contract.servicesDescription,
        paymentTerms: contract.paymentTerms,
        deliveryDeadline: contract.deliveryDeadline,
        revisionCount: contract.revisionCount,
        cancellationTerms: contract.cancellationTerms,
        contentUsageRights: contract.contentUsageRights,
        usageDuration: contract.usageDuration,
        isExclusive: contract.isExclusive,
        exclusivityTerms: contract.exclusivityTerms,
        validUntil: contract.validUntil,
        signedAt: contract.signedAt,
        createdAt: contract.createdAt,
        creatorName,
        creatorEmail,
        agencyName: agencyData?.name || undefined,
      };

      const pdfBuffer = await PDFService.generateContractPDFBuffer(pdfData, customizationOptions); // 🚀 Opções passadas aqui
      const fileName = `Contrato_Influkit_${contract.brandName.replace(/\s+/g, '_')}_${contract.id.substring(0, 8)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.end(pdfBuffer);
    } catch (error) {
      console.error('Erro ao gerar PDF do contrato:', error);
      return res.status(500).json({ error: 'Erro ao gerar o arquivo PDF do contrato.' });
    }
  }

  /**
   * 8.3, 8.4 & 9. Enviar Contrato por E-mail para a Marca (Atualiza estado para SENT)
   */
  static async sendContractEmail(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    const { id } = req.params;
    const { customMessage } = req.body;

    try {
      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          user: { select: { name: true, email: true } },
          creator: { select: { name: true, email: true } },
        },
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const hasAccess = await ContractController.verifyContractAccess(
        req.user.id,
        req.user.role,
        contract.userId,
        contract.creatorId
      );

      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado a este contrato.' });
      }

      if (!contract.brandEmail) {
        return res.status(400).json({ error: 'Este contrato não possui um e-mail de marca associado.' });
      }

      // 🚀 Obter definições de personalização de PDF do utilizador (Fase 9)
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

      const agencyData = contract.agencySnapshot as any;
      const creatorName = contract.creator ? contract.creator.name : contract.user.name;
      const creatorEmail = contract.creator ? contract.creator.email : contract.user.email;

      const pdfData = {
        id: contract.id,
        title: contract.title,
        contractType: contract.contractType,
        brandName: contract.brandName,
        brandEmail: contract.brandEmail,
        totalAmount: contract.totalAmount,
        currency: contract.currency,
        status: contract.status,
        servicesDescription: contract.servicesDescription,
        paymentTerms: contract.paymentTerms,
        deliveryDeadline: contract.deliveryDeadline,
        revisionCount: contract.revisionCount,
        cancellationTerms: contract.cancellationTerms,
        contentUsageRights: contract.contentUsageRights,
        usageDuration: contract.usageDuration,
        isExclusive: contract.isExclusive,
        exclusivityTerms: contract.exclusivityTerms,
        validUntil: contract.validUntil,
        signedAt: contract.signedAt,
        createdAt: contract.createdAt,
        creatorName,
        creatorEmail,
        agencyName: agencyData?.name || undefined,
      };

      const pdfBuffer = await PDFService.generateContractPDFBuffer(pdfData, customizationOptions); // 🚀 Opções passadas aqui

      await MailService.sendCustomProposalEmail({
        brandEmail: contract.brandEmail,
        brandName: contract.brandName,
        proposalTitle: `Contrato Formalizado: ${contract.title}`,
        creatorName: creatorName || 'Criador de Conteúdo',
        creatorEmail: creatorEmail,
        customMessage: customMessage || 'Segue em anexo o documento de contrato formal para análise e validação.',
        pdfBuffer,
      });

      await prisma.contract.update({
        where: { id },
        data: { status: 'SENT' },
      });

      return res.status(200).json({ message: 'Contrato comercial enviado com sucesso para la marca!' });
    } catch (error) {
      console.error('Erro ao enviar contrato por e-mail:', error);
      return res.status(500).json({ error: 'Erro ao enviar o contrato por e-mail.' });
    }
  }
}