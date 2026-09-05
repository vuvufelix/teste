import { describe, it, expect } from 'vitest';
import { prisma } from '../config/prisma.js';

describe('Validação da Modelagem do Banco de Dados (Prisma ORM)', () => {
  it('Deve garantir a criação de um Mídia Kit associado a um Usuário', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Criador Exemplo',
        email: `criador_${Date.now()}@teste.com`,
        passwordHash: 'hash_simulado',
        trialEndsAt: new Date(),
      },
    });

    const mediaKit = await prisma.mediaKit.create({
      data: {
        userId: user.id,
        slug: `slug-${Date.now()}`,
        bio: 'Biografia de teste do criador',
        niche: 'Tecnologia',
      },
    });

    expect(mediaKit).toHaveProperty('id');
    expect(mediaKit.userId).toBe(user.id);

    // Limpeza
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('Deve permitir adicionar Redes Sociais ao Mídia Kit', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Criador Redes',
        email: `redes_${Date.now()}@teste.com`,
        passwordHash: 'hash_simulado',
        trialEndsAt: new Date(),
      },
    });

    const mediaKit = await prisma.mediaKit.create({
      data: {
        userId: user.id,
        slug: `slug-social-${Date.now()}`,
      },
    });

    const social = await prisma.socialNetwork.create({
      data: {
        mediaKitId: mediaKit.id,
        platform: 'INSTAGRAM',
        username: 'dev_influencer',
        followersCount: 15000,
        engagementRate: 4.5,
      },
    });

    expect(social).toHaveProperty('id');
    expect(social.followersCount).toBe(15000);

    // Limpeza em cascata do usuário apaga o mediaKit e as redes
    await prisma.user.delete({ where: { id: user.id } });
  });
});