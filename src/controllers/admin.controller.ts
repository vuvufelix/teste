import { Response } from 'express';
import { PaymentOrder, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { reviewPaymentSchema, updateUserPlanSchema } from '../schemas/admin.schema.js';

export class AdminController {
  // Retorna métricas globais do SaaS (MRR, Receita, Assinantes)
  static async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    const totalUsers = await prisma.user.count();
    const activeSubscriptions = await prisma.user.count({
      where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });

    const pendingPaymentsCount = await prisma.paymentOrder.count({
      where: { status: 'PENDING' },
    });

    // Buscar pagamentos aprovados para cálculo de receita acumulada
    const approvedPayments: PaymentOrder[] = await prisma.paymentOrder.findMany({
      where: { status: 'APPROVED' },
    });

    const totalRevenueUSD = approvedPayments
      .filter((p: PaymentOrder) => p.currency === 'USD')
      .reduce((acc: number, p: PaymentOrder) => acc + p.amount, 0);

    const totalRevenueAOA = approvedPayments
      .filter((p: PaymentOrder) => p.currency === 'AOA')
      .reduce((acc: number, p: PaymentOrder) => acc + p.amount, 0);

    // Métricas por plano
    const planDistribution = await prisma.user.groupBy({
      by: ['planId'],
      _count: { id: true },
    });

    return res.status(200).json({
      metrics: {
        totalUsers,
        activeSubscriptions,
        pendingPaymentsCount,
        revenue: {
          USD: totalRevenueUSD,
          AOA: totalRevenueAOA,
        },
      },
      planDistribution,
    });
  }

  // Listar ordens de pagamento pendentes de análise manual (AOA)
  static async getPendingPayments(req: AuthenticatedRequest, res: Response) {
    try {
      const pendingOrders = await prisma.paymentOrder.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({ pendingOrders });
    } catch (error) {
      console.error('Erro ao listar pagamentos pendentes:', error);
      return res.status(500).json({ error: 'Erro ao buscar ordens de pagamento.' });
    }
  }

  // Aprovar ou Rejeitar Pagamento em Kwanza (AOA)
  static async reviewPaymentOrder(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;

    const parseResult = reviewPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Ação ou justificativa de decisão inválida.',
        details: parseResult.error.format(),
      });
    }

    const { action, rejectionReason } = parseResult.data;

    const order = await prisma.paymentOrder.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({ error: 'Ordem de pagamento não encontrada.' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Esta ordem já foi analisada anteriormente.' });
    }

    if (action === 'APPROVE') {
      await prisma.$transaction([
        prisma.paymentOrder.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: order.userId },
          data: {
            planId: order.planId,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
          },
        }),
      ]);

      return res.status(200).json({
        message: 'Pagamento aprovado com sucesso! O plano do usuário foi ativado.',
      });
    } else {
      await prisma.paymentOrder.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason || 'Comprovativo de pagamento inválido ou não identificado.',
        },
      });

      return res.status(200).json({
        message: 'Pagamento rejeitado com sucesso.',
      });
    }
  }

  // Listar todos os usuários da plataforma (Paginado)
  static async listUsers(req: AuthenticatedRequest, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          subscriptionStatus: true,
          createdAt: true,
          plan: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  // Alteração manual do Plano e Status de um Usuário
  static async updateUserPlan(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;

    const parseResult = updateUserPlanSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Dados do plano ou status inválidos.' });
    }

    const { planSlug, subscriptionStatus } = parseResult.data;

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    const formattedStatus = (
      subscriptionStatus === 'CANCELLED' ? 'CANCELED' : subscriptionStatus
    ) as SubscriptionStatus;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        planId: plan.id,
        subscriptionStatus: formattedStatus,
      },
      select: {
        id: true,
        name: true,
        email: true,
        subscriptionStatus: true,
        plan: true,
      },
    });

    return res.status(200).json({
      message: 'Plano e status do usuário atualizados com sucesso.',
      user: updatedUser,
    });
  }
}