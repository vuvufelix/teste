import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentController } from '../controllers/payment.controller.js';
import { prisma } from '../config/prisma.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    plan: {
      findUnique: vi.fn(),
    },
    paymentOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('PaymentController - Gestão de Ordens e Pagamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deve impedir a criação de um pagamento manual AOA se o plano selecionado não existir', async () => {
    vi.mocked(prisma.plan.findUnique).mockResolvedValueOnce(null);

    const req = {
      user: { id: 'user-influencer-1' },
      body: {
        planId: 'plan-inexistente',
        currency: 'AOA',
        bankReference: 'REF-998877',
      },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await PaymentController.createManualAOAPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Plano selecionado não encontrado.' })
    );
  });
});