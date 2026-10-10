import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/prisma.js';

describe('Módulo de Propostas Comerciais', () => {
  let token: string;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Criador de Propostas',
      email: `proposal_creator_${Date.now()}@teste.com`,
      password: 'password123',
    });

    token = res.body.accessToken;
  });

  it('Deve criar uma nova proposta comercial com cálculo automático de totais', async () => {
    const proposalData = {
      brandName: 'Nike Brasil',
      brandEmail: 'marketing@nike.com',
      title: 'Campanha de Lançamento de Tênis',
      currency: 'USD',
      validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        { deliverable: '1x Vídeo Reels no Instagram', quantity: 2, unitPrice: 300.0 },
        { deliverable: '3x Stories com Link', quantity: 1, unitPrice: 150.0 },
      ],
    };

    const response = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${token}`)
      .send(proposalData);

    expect(response.status).toBe(201);
    expect(response.body.proposal).toHaveProperty('id');
    expect(response.body.proposal.totalAmount).toBe(750.0); // (2*300) + (1*150)
    expect(response.body.proposal.items).toHaveLength(2);
  });

  it('Deve gerar a visualização da proposta comercial formatada para PDF/HTML', async () => {
    const createRes = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        brandName: 'Adidas',
        title: 'Campanha de Inverno',
        currency: 'USD',
        validUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ deliverable: 'Post Carrossel', quantity: 1, unitPrice: 400.0 }],
      });

    const proposalId = createRes.body.proposal.id;

    const pdfRes = await request(app)
      .get(`/api/proposals/${proposalId}/pdf`)
      .set('Authorization', `Bearer ${token}`);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.text).toContain('PROPOSTA COMERCIAL');
    expect(pdfRes.text).toContain('Adidas');
    expect(pdfRes.text).toContain('400.00 USD');

    afterAll(async () => {
    await prisma.$disconnect();
    });
  });
});