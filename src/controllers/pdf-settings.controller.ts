import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { updatePdfSettingsSchema } from '../schemas/pdf-settings.schema.js';

export class PdfSettingsController {
  
  /**
   * Obter as definições de personalização de PDF do utilizador (cria padrão se não existir)
   */
  static async getSettings(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    let settings = await prisma.pdfCustomizationSettings.findUnique({
      where: { userId: req.user.id },
    });

    if (!settings) {
      settings = await prisma.pdfCustomizationSettings.create({
        data: {
          userId: req.user.id,
          primaryColor: '#6366F1',
          secondaryColor: '#8B5CF6',
          templateStyle: 'STANDARD',
          hideWatermark: false,
        },
      });
    }

    return res.status(200).json({ settings });
  }

  /**
   * Atualizar definições de personalização validando permissões de plano (Fase 9.2)
   */
  static async updateSettings(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = updatePdfSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nas definições.',
        details: parseResult.error.format(),
      });
    }

    // Obter plano e nível de personalização do utilizador
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });

    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const customizationLevel = user.plan?.customizationLevel || 'BASIC'; // BASIC, INTERMEDIATE, ADVANCED

    const {
      logoUrl,
      primaryColor,
      secondaryColor,
      templateStyle,
      customHeader,
      customFooter,
      hideWatermark,
    } = parseResult.data;

    // 🔒 Validação de Restrições por Nível de Plano (Fase 9.2)
    if (!isSuperAdmin) {
      if (customizationLevel === 'BASIC') {
        if (logoUrl || primaryColor || secondaryColor || hideWatermark || templateStyle) {
          return res.status(403).json({
            error: 'O seu plano atual (Básico) não permite personalização de cores, logótipos ou templates. Faça upgrade para o nível Intermédio ou Avançado.',
            code: 'PLAN_UPGRADE_REQUIRED',
          });
        }
      }

      if (customizationLevel === 'INTERMEDIATE') {
        // Intermédio permite logótipo e cores, mas bloqueia templates avançados ou rodapés personalizados complexos
        if (templateStyle && templateStyle !== 'STANDARD') {
          return res.status(403).json({
            error: 'O seu plano permite apenas o modelo standard. Faça upgrade para o plano Avançado para desbloquear múltiplos templates.',
            code: 'ADVANCED_TEMPLATE_LOCKED',
          });
        }
      }
    }

    // Atualizar ou criar registo na base de dados
    const updatedSettings = await prisma.pdfCustomizationSettings.upsert({
      where: { userId: req.user.id },
      update: {
        ...(logoUrl !== undefined && { logoUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(secondaryColor !== undefined && { secondaryColor }),
        ...(templateStyle !== undefined && { templateStyle }),
        ...(customHeader !== undefined && { customHeader }),
        ...(customFooter !== undefined && { customFooter }),
        ...(hideWatermark !== undefined && { hideWatermark }),
      },
      create: {
        userId: req.user.id,
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || '#6366F1',
        secondaryColor: secondaryColor || '#8B5CF6',
        templateStyle: templateStyle || 'STANDARD',
        customHeader: customHeader || null,
        customFooter: customFooter || null,
        hideWatermark: hideWatermark ?? false,
      },
    });

    return res.status(200).json({
      message: 'Definições de PDF atualizadas com sucesso!',
      settings: updatedSettings,
    });
  }
}