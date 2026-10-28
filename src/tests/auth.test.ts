import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../controllers/auth.controller.js';
import { prisma } from '../config/prisma.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    plan: {
      findFirst: vi.fn(),
    },
  },
}));

describe('AuthController - Registo e Segurança', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deve impedir o registo de um utilizador com um e-mail já existente', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'existing-id', email: 'teste@influkit.com' } as any);

    const req = {
      body: {
        name: 'Utilizador Teste',
        email: 'teste@influkit.com',
        password: 'Password123!',
        role: 'INFLUENCER',
      },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'E-mail já está em uso.' }));
  });

  it('Deve atribuir corretamente o plano gratuito predefinido no registo de um influenciador', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null); // E-mail livre
    vi.mocked(prisma.plan.findFirst).mockResolvedValueOnce({ id: 'free-plan-id', slug: 'influencer-free' } as any);
    
    const mockCreatedUser = {
      id: 'new-user-id',
      name: 'Novo Influenciador',
      email: 'novo@influkit.com',
      role: 'INFLUENCER',
      planId: 'free-plan-id',
    };

    vi.mocked(prisma.user.create).mockResolvedValueOnce(mockCreatedUser as any);

    const req = {
      body: {
        name: 'Novo Influenciador',
        email: 'novo@influkit.com',
        password: 'Password123!',
        role: 'INFLUENCER',
      },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: 'free-plan-id',
          role: 'INFLUENCER',
        }),
      })
    );
  });
});