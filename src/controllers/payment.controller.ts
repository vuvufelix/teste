import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createCheckoutSchema, createManualAOAPaymentSchema } from '../schemas/payment.schema.js';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { StripeService, stripe } from '../services/stripe.service.js';
import { env } from '../config/env.js';
import { NotificationService } from '../services/notification.service.js';
import Stripe from 'stripe';

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

  // Criar Checkout (Suporta Moedas AOA, USD, EUR e Stripe Real)
  static async createCheckout(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const parseResult = createCheckoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Dados de checkout inválidos.', 
        details: parseResult.error.format() 
      });
    }

    const { planSlug, currency } = parseResult.data;

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: 'Plano não encontrado ou inativo.' });
    }

    // Definir o preço autoritativo com base na moeda selecionada
    let unitAmount = 0;
    if (currency === 'AOA') unitAmount = plan.priceAOA;
    else if (currency === 'USD') unitAmount = plan.priceUSD;
    else if (currency === 'EUR') unitAmount = plan.priceEUR;

    if (unitAmount === 0 && currency !== 'AOA') {
      return res.status(400).json({ error: 'Este plano é gratuito e não requer pagamento online.' });
    }

    // Se a moeda for AOA, o fluxo é estritamente manual por transferência bancária
    if (currency === 'AOA') {
      const order = await prisma.paymentOrder.create({
        data: {
          userId: req.user.id,
          planId: plan.id,
          amount: unitAmount,
          currency: 'AOA',
          paymentMethod: 'BANK_TRANSFER_AOA',
          status: 'PENDING',
        },
      });

      return res.status(200).json({
        message: 'Ordem criada em AOA. Por favor, envie o comprovativo de transferência.',
        orderId: order.id,
        manualPayment: true,
      });
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
        return res.status(404).json({ error: 'Utilizador não encontrado.' });
      }

      // --- FLUXO REAL (STRIPE CHECKOUT para USD ou EUR) ---
      const session = await StripeService.createCheckoutSession({
        planName: plan.name,
        amount: Number(unitAmount),
        currency: currency.toLowerCase(), // 'usd' ou 'eur'
        userEmail: user.email,
        userId: req.user.id,
        planId: plan.id,
      });

      stripeSessionId = session.id;
      checkoutUrl = session.url!;
    }

    // Registra a ordem PENDING na BD com o preço e moeda autoritativos
    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.user.id,
        planId: plan.id,
        amount: unitAmount,
        currency,
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

  // Aprovação Manual de Pagamentos em Kwanza pelo Admin (Isolado do fluxo Stripe)
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

    await NotificationService.sendPushToUser(order.userId, {
      title: 'Status do pagamento (Influkit)! 🚀',
      body: `Pagamento aprovado e assinatura ativada por ${durationDays} dias com sucesso.`
    });

    return res.status(200).json({
      message: `Pagamento aprovado e assinatura ativada por ${durationDays} dias com sucesso.`,
      subscriptionEndsAt,
    });
  }

  // Webhook Seguro da Stripe com Validação Criptográfica Estrita e Idempotência
  static async stripeWebhook(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'];

    if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
      console.error('❌ Assinatura do webhook Stripe em falta ou segredo não configurado.');
      return res.status(400).json({ error: 'Assinatura do webhook em falta ou segredo não configurado.' });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error(`❌ Falha na verificação da assinatura do Webhook Stripe: ${err.message}`);
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSessionId = session.id;
        const paymentStatus = session.payment_status;

        if (!stripeSessionId || paymentStatus !== 'paid') {
          return res.status(400).json({ error: 'Sessão inválida ou pagamento não concluído.' });
        }

        const order = await prisma.paymentOrder.findFirst({
          where: { stripeSessionId },
          include: { plan: true },
        });

        if (!order) {
          return res.status(200).json({ received: true, message: 'Sessão não associada a nenhuma ordem local.' });
        }

        if (order.status === 'APPROVED') {
          return res.status(200).json({ received: true, message: 'Evento já processado anteriormente.' });
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

      return res.status(200).json({ received: true, message: `Evento ${event.type} ignorado.` });
    } catch (error) {
      console.error('Erro interno ao processar webhook da Stripe:', error);
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