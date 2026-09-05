import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/prisma.js';

describe('Módulo de Pagamentos (Stripe + Kwanza Manual)', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    // Garante que o plano 'pro' existe no banco para os testes
    await prisma.plan.upsert({
      where: { slug: 'pro' },
      update: {},
      create: {
        name: 'Plano Profissional',
        slug: 'pro',
        priceUSD: 30.0,
        priceAOA: 28000.0,
        priceBRL: 150.0,
        maxSocialNetworks: -1,
        maxProposalsPerMonth: -1,
      },
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Cliente Pagador',
      email: `payer_${Date.now()}@teste.com`,
      password: 'password123',
    });

    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  it('Deve obter os dados bancários para pagamento em Kwanza (AOA)', async () => {
    const res = await request(app)
      .get('/api/payments/bank-details')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('iban');
    expect(res.body.currency).toBe('AOA');
  });

  it('Deve registrar um pedido de pagamento em Kwanza com envio do comprovativo', async () => {
    const res = await request(app)
      .post('/api/payments/aoa/manual')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planSlug: 'pro',
        receiptBase64: 'data:image/png;base64,iVBORw0KGgoAAAANANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        bankReference: 'REF-12345678',
      });

    expect(res.status).toBe(201);
    expect(res.body.paymentOrder.status).toBe('PENDING');
    expect(res.body.paymentOrder.currency).toBe('AOA');
    expect(res.body.paymentOrder).toHaveProperty('receiptUrl');
  });

  it('Deve processar com sucesso o Webhook do Stripe ativando a conta do usuário', async () => {
    const checkoutRes = await request(app)
      .post('/api/payments/stripe/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ planSlug: 'pro' });

    const sessionId = checkoutRes.body.stripeSessionId;

    const webhookRes = await request(app)
      .post('/api/payments/webhook/stripe')
      .send({
        sessionId,
        status: 'paid',
      });

    expect(webhookRes.status).toBe(200);

    const userUpdated = await prisma.user.findUnique({ where: { id: userId } });
    expect(userUpdated?.subscriptionStatus).toBe('ACTIVE');
  });
});