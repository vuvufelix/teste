import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/prisma.js';

describe('Autenticação e Regras de Negócio de Trial', () => {
  const testUser = {
    name: 'Influencer Teste',
    email: 'influencer@teste.com',
    password: 'password123',
    role: 'INFLUENCER',
  };

  beforeEach(async () => {
    // Limpa banco simulado ou de testes
    await prisma.user.deleteMany({ where: { email: testUser.email } });
  });

  it('Deve registrar um novo usuário com 14 dias de Trial automático', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user.subscriptionStatus).toBe('TRIALING');

    const trialEndsAt = new Date(response.body.user.trialEndsAt);
    const expectedTrialDate = new Date();
    expectedTrialDate.setDate(expectedTrialDate.getDate() + 14);

    expect(trialEndsAt.getDate()).toBe(expectedTrialDate.getDate());
  });

  it('Deve autenticar o usuário e retornar o token de acesso', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty('accessToken');
    expect(loginResponse.get('Set-Cookie')).toBeDefined();
  });

  it('Deve rejeitar login com credenciais incorretas', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'inexistente@teste.com',
        password: 'senha_errada',
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Credenciais inválidas.');
  });
});