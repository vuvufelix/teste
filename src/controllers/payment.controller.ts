import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createStripeCheckoutSchema, createManualAOAPaymentSchema } from '../schemas/payment.schema.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { StripeService, stripe } from '../services/stripe.service.js';
import { env } from '../config/env.js';

/**
 * Calcula a data de expiração com base nos dias definidos no plano.
 */
function calculateSubscriptionEndsAt(days: number): Date {
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + days);
  return endsAt;
}

export class PaymentController {
  // Retorna os dados bancários para transferência manual em Kwanza
  static async getBankDetails(req: Request, res: Response) {
    return res.status(200).json({
      currency: 'AOA',
      bankName: 'Banco Angolano de Investimentos (BAI)',
      accountName: env.BANK_ACCOUNT_NAME,
      iban: env.BANK_IBAN_AOA,
      instructions: 'Efetue a transferência ou pagamento por referência do valor exato do plano e envie o comprovativo nesta mesma tela.',
    });
  }

  // Criar Checkout (Suporta Modo Simulado e Stripe Real)
  static async createStripeCheckout(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = createStripeCheckoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Plano inválido selecionado.' });
    }

    const { planSlug } = parseResult.data;

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    const useMock = process.env.USE_MOCK_PAYMENT === 'true';

    let stripeSessionId: string;
    let checkoutUrl: string;

    if (useMock) {
      // --- FLUXO SIMULADO (DEV) ---
      stripeSessionId = `cs_test_${Date.now()}_${req.user.id.substring(0, 5)}`;
      checkoutUrl = `${env.FRONTEND_URL}/payment/success?session_id=${stripeSessionId}`;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // --- FLUXO REAL (STRIPE CHECKOUT) ---
      const session = await StripeService.createCheckoutSession({
        planName: plan.name,
        amountUSD: Number(plan.priceUSD),
        userEmail: user.email,
        userId: req.user.id,
        planId: plan.id,
      });

      stripeSessionId = session.id;
      checkoutUrl = session.url!;
    }

    // Registra a ordem PENDING na BD
    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.user.id,
        planId: plan.id,
        amount: plan.priceUSD,
        currency: 'USD',
        paymentMethod: 'STRIPE_CARD',
        status: 'PENDING',
        stripeSessionId,
      },
    });

    return res.status(200).json({
      orderId: order.id,
      checkoutUrl,
      stripeSessionId,
    });
  }

  // Criar Pedido de Pagamento Manual em Kwanza (AOA) com Comprovativo
  static async createManualAOAPayment(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = createManualAOAPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados de pagamento em Kwanza inválidos.',
        details: parseResult.error.format(),
      });
    }

    const { planSlug, receiptBase64, bankReference } = parseResult.data;

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) {
      return res.status(404).json({ error: 'Plano selecionado não encontrado.' });
    }

    const receiptUrl = await CloudinaryService.uploadImage(receiptBase64, 'receipts');

    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        userId: req.user.id,
        planId: plan.id,
        amount: plan.priceAOA,
        currency: 'AOA',
        paymentMethod: 'BANK_TRANSFER_AOA',
        status: 'PENDING',
        receiptUrl,
        bankReference,
      },
    });

    return res.status(201).json({
      message: 'Comprovativo enviado com sucesso! O seu acesso será liberado assim que o pagamento for validado pela equipe.',
      paymentOrder,
    });
  }

  // Aprovação Manual de Pagamentos em Kwanza pelo Admin
  static async approveManualAOAPayment(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { orderId } = req.params;

    const order = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { plan: true },
    });

    if (!order || order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Ordem não encontrada ou já processada.' });
    }

    // Lê os dias de duração cadastrados no plano vinculado
    const durationDays = order.plan.durationInDays;
    const subscriptionEndsAt = calculateSubscriptionEndsAt(durationDays);

    await prisma.$transaction([
      prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: order.userId },
        data: {
          planId: order.planId,
          subscriptionStatus: 'ACTIVE',
          subscriptionEndsAt,
        },
      }),
    ]);

    return res.status(200).json({
      message: `Pagamento aprovado e assinatura ativada por ${durationDays} dias com sucesso.`,
      subscriptionEndsAt,
    });
  }

  // Webhook Flexível (Suporta Stripe Real com Verificação de Assinatura, CLI e Insomnia)
  static async stripeWebhook(req: Request, res: Response) {
    try {
      let event = req.body;

      const signature = req.headers['stripe-signature'];
      if (signature && env.STRIPE_WEBHOOK_SECRET) {
        try {
          event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            env.STRIPE_WEBHOOK_SECRET
          );
        } catch (err: any) {
          console.warn('⚠️ Falha ao verificar assinatura do Webhook Stripe, processando payload padrão.');
        }
      }

      // 1. Processamento de Eventos Oficiais da Stripe
      if (event && event.type) {
        if (event.type !== 'checkout.session.completed') {
          return res.status(200).json({ received: true, message: `Evento ${event.type} ignorado.` });
        }

        const session = event.data?.object;
        const stripeSessionId = session?.id;
        const paymentStatus = session?.payment_status;

        if (!stripeSessionId || paymentStatus !== 'paid') {
          return res.status(400).json({ error: 'Sessão inválida ou pagamento não concluído.' });
        }

        const order = await prisma.paymentOrder.findFirst({
          where: { stripeSessionId },
          include: { plan: true },
        });

        if (!order) {
          return res.status(200).json({
            received: true,
            message: 'Evento de teste recebido, mas a sessão não pertence a uma ordem local.',
          });
        }

        const durationDays = order.plan.durationInDays;
        const subscriptionEndsAt = calculateSubscriptionEndsAt(durationDays);

        await prisma.$transaction([
          prisma.paymentOrder.update({
            where: { id: order.id },
            data: { status: 'APPROVED', approvedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: order.userId },
            data: {
              planId: order.planId,
              subscriptionStatus: 'ACTIVE',
              subscriptionEndsAt,
            },
          }),
        ]);

        return res.status(200).json({ received: true, orderId: order.id });
      }

      // 2. Processamento de Requisições Manuais via Insomnia ({ sessionId, status })
      const { sessionId, status } = req.body;

      if (!sessionId || status !== 'paid') {
        return res.status(400).json({ error: 'Evento de webhook inválido ou não pago.' });
      }

      const order = await prisma.paymentOrder.findFirst({
        where: { stripeSessionId: sessionId },
        include: { plan: true },
      });

      if (!order) {
        return res.status(404).json({ error: 'Ordem de pagamento não encontrada.' });
      }

      const durationDays = order.plan.durationInDays;
      const subscriptionEndsAt = calculateSubscriptionEndsAt(durationDays);

      await prisma.$transaction([
        prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'APPROVED', approvedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: order.userId },
          data: {
            planId: order.planId,
            subscriptionStatus: 'ACTIVE',
            subscriptionEndsAt,
          },
        }),
      ]);

      return res.status(200).json({ received: true, orderId: order.id });
    } catch (error) {
      console.error('Erro ao processar webhook:', error);
      return res.status(500).json({ error: 'Erro interno ao processar webhook.' });
    }
  }

  // Obter Histórico de Pagamentos do Usuário
  static async getMyPayments(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const payments = await prisma.paymentOrder.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ payments });
  }
}