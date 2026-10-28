import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalController } from '../controllers/proposal.controller.ts';
import { prisma } from '../config/prisma.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    proposal: {
      count: vi.fn(),
      create: vi.fn(),
    },
    agencyDelegation: {
      findUnique: vi.fn(),
    },
  },
}));

describe('ProposalController - Criação e Limites de Propostas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deve bloquear a criação de propostas se o limite mensal do plano for atingido', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-influencer-1',
      role: 'INFLUENCER',
      subscriptionStatus: 'ACTIVE',
      plan: { maxProposalsPerMonth: 2, hasAIAssistant: false },
    } as any);

    // Simula que o utilizador já criou 2 propostas este mês
    vi.mocked(prisma.proposal.count).mockResolvedValueOnce(2);

    const req = {
      user: { id: 'user-influencer-1', role: 'INFLUENCER' },
      body: {
        brandName: 'Marca Exemplo',
        title: 'Campanha de Inverno',
        currency: 'USD',
        totalAmount: 1000,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        items: [{ deliverable: '1x Post', quantity: 1, unitPrice: 1000 }],
      },
      headers: {},
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await ProposalController.createProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROPOSAL_LIMIT_REACHED' })
    );
  });
});