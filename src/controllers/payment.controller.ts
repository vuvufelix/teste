import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { createStripeCheckoutSchema, createManualAOAPaymentSchema } from '../schemas/payment.schema';
import { CloudinaryService } from '../services/cloudinary.service.js';
import { env } from '../config/env.js';

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

  // Criar Checkout Simulado / Integração Stripe (USD)
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

    const mockStripeSessionId = `cs_test_${Date.now()}_${req.user.id.substring(0, 5)}`;

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.user.id,
        planId: plan.id,
        amount: plan.priceUSD,
        currency: 'USD',
        paymentMethod: 'STRIPE_CARD',
        status: 'PENDING',
        stripeSessionId: mockStripeSessionId,
      },
    });

    // URL mock de checkout do Stripe ou URL de Sucesso em modo Dev
    const checkoutUrl = `${env.FRONTEND_URL}/payment/success?session_id=${mockStripeSessionId}`;

    return res.status(200).json({
      orderId: order.id,
      checkoutUrl,
      stripeSessionId: mockStripeSessionId,
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

    // Upload do comprovativo para o Cloudinary
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

  // Webhook Simulado / Callback de Confirmação do Stripe (USD)
  static async stripeWebhook(req: Request, res: Response) {
    const { sessionId, status } = req.body;

    if (!sessionId || status !== 'paid') {
      return res.status(400).json({ error: 'Evento de webhook inválido ou não pago.' });
    }

    const order = await prisma.paymentOrder.findFirst({
      where: { stripeSessionId: sessionId },
    });

    if (!order) {
      return res.status(404).json({ error: 'Ordem de pagamento não encontrada.' });
    }

    // Atualiza pedido e ativa o plano do usuário
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
        },
      }),
    ]);

    return res.status(200).json({ received: true });
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