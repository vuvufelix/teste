import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractController } from '../controllers/contract.controller.ts';
import { prisma } from '../config/prisma.ts';
import { PDFService } from '../services/pdf.service.ts';

// 🔒 Mock do Prisma Client para evitar tocar na base de dados real durante os testes unitários
vi.mock('../config/prisma.js', () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agencyDelegation: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    pdfCustomizationSettings: {
      findUnique: vi.fn(),
    },
  },
}));

// 📄 Mock do PDFService para testar a geração sem lançar o Puppeteer
vi.mock('../services/pdf.service.js', () => ({
  PDFService: {
    generateContractHTML: vi.fn().mockReturnValue('<html>Mocked Contract HTML</html>'),
    generateContractPDFBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf-buffer')),
  },
}));

describe('ContractController - Segurança e Gestão de Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deve negar acesso a um utilizador não autenticado', async () => {
    const req = { user: undefined, params: { id: 'contract-123' } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await ContractController.getContractById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado.' });
  });

  it('Deve permitir que o criador do contrato aceda aos seus próprios detalhes', async () => {
    const mockContract = {
      id: 'contract-123',
      userId: 'user-influencer-1',
      creatorId: null,
      title: 'Campanha Instagram',
      brandName: 'Marca X',
      status: 'DRAFT',
    };

    vi.mocked(prisma.contract.findUnique).mockResolvedValueOnce(mockContract as any);

    const req = {
      user: { id: 'user-influencer-1', role: 'INFLUENCER' },
      params: { id: 'contract-123' },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await ContractController.getContractById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ contract: mockContract }));
  });

  it('Deve impedir a retrocessão de estado de um contrato já assinado (Fase 8.5)', async () => {
    const mockContract = {
      id: 'contract-123',
      userId: 'user-influencer-1',
      status: 'SIGNED', // Já assinado
    };

    vi.mocked(prisma.contract.findUnique).mockResolvedValueOnce(mockContract as any);

    const req = {
      user: { id: 'user-influencer-1', role: 'INFLUENCER' },
      params: { id: 'contract-123' },
      body: { status: 'DRAFT' }, // Tentativa de retroceder para rascunho
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await ContractController.updateStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Não é possível retroceder o estado'),
      })
    );
  });
});