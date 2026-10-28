import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaKitController } from '../controllers/media-kit.controller.ts';
import { prisma } from '../config/prisma.ts';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    mediaKit: {
      findUnique: vi.fn(),
    },
  },
}));

describe('MediaKitController - Visualização Pública e Privacidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Deve retornar 404 se o Mídia Kit não estiver público ou não existir', async () => {
    vi.mocked(prisma.mediaKit.findUnique).mockResolvedValueOnce(null);

    const req = {
      params: { slug: 'slug-privado-ou-inexistente' },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await MediaKitController.getPublicMediaKit(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Mídia Kit não encontrado ou não está público.' })
    );
  });
});