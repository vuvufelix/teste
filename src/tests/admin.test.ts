import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { Role, SubscriptionStatus } from '@prisma/client'; // <-- Importando os Enums
import app from '../app.js';
import { prisma } from '../config/prisma.js';

describe('Módulo Administrativo (Super Admin)', () => {
  let adminToken: string;
  let userToken: string;
  let normalUserId: string;

  // admin.test.ts
    beforeEach(async () => {
    // Limpeza
    await prisma.paymentOrder.deleteMany();
    await prisma.user.deleteMany();

    // 1. Criar usuário Administrador
    const adminRes = await request(app).post('/api/auth/register').send({
        name: 'Super Admin',
        email: `admin_${Date.now()}@teste.com`,
        password: 'password123',
    });

    adminToken = adminRes.body.accessToken;

    // Promover a SUPER_ADMIN no banco
    await prisma.user.update({
        where: { id: adminRes.body.user.id },
        data: { role: Role.SUPER_ADMIN },
    });

    // 2. Criar usuário Normal
    const userRes = await request(app).post('/api/auth/register').send({
        name: 'Usuario Comum',
        email: `user_${Date.now()}@teste.com`,
        password: 'password123',
    });

    userToken = userRes.body.accessToken;
    normalUserId = userRes.body.user.id;
    });

  // Desconecta o Prisma para que a thread nativa do C++ encerre sem dar crash
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Deve bloquear acesso de usuários não-administradores às rotas do Admin', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Acesso negado');
  });

  it('Deve permitir que o Admin aprove um pagamento em Kwanza e ative a assinatura', async () => {
    // Garante que o plano 'pro' existe
    const plan = await prisma.plan.upsert({
      where: { slug: 'pro' },
      update: {},
      create: {
        name: 'Plano Profissional',
        slug: 'pro',
        priceUSD: 30,
        priceAOA: 28000,
        priceBRL: 150,
        maxSocialNetworks: -1,
        maxProposalsPerMonth: -1,
      },
    });

    // Criar um pedido de pagamento pendente
    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        userId: normalUserId,
        planId: plan.id,
        amount: 28000,
        currency: 'AOA',
        paymentMethod: 'BANK_TRANSFER_AOA',
        status: 'PENDING',
        receiptUrl: 'http://cloudinary.com/fake-receipt.png',
      },
    });

    // Aprovar o pagamento via Admin API
    const res = await request(app)
      .post(`/api/admin/payments/${paymentOrder.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    expect(res.status).toBe(200);

    // Confirmar que o status do usuário mudou para ACTIVE usando o Enum
    const updatedUser = await prisma.user.findUnique({ where: { id: normalUserId } });
    expect(updatedUser?.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE); // <-- Corrigido aqui também
  });
});