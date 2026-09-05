import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../config/prisma.js';

describe('Módulo Mídia Kit e Redes Sociais', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const email = `test_mediakit_${Date.now()}@teste.com`;
    const res = await request(app).post('/api/auth/register').send({
      name: 'Criador Mídia Kit',
      email,
      password: 'password123',
    });

    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  it('Deve criar/buscar o Mídia Kit do usuário autenticado', async () => {
    const response = await request(app)
      .get('/api/media-kit/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.mediaKit).toHaveProperty('id');
    expect(response.body.mediaKit.userId).toBe(userId);
  });

  it('Deve atualizar as informações do Mídia Kit e alterar o slug', async () => {
    const newSlug = `meu-slug-unico-${Date.now()}`;
    const response = await request(app)
      .put('/api/media-kit/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: newSlug,
        bio: 'Criador de conteúdo sobre tecnologia e programação.',
        niche: 'Tecnologia',
        location: 'Luanda, Angola',
        isPublic: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.mediaKit.slug).toBe(newSlug);
    expect(response.body.mediaKit.bio).toContain('tecnologia');
  });

  it('Deve permitir acessar publicamente o Mídia Kit pelo slug sem autenticação', async () => {
    const slug = `public-slug-${Date.now()}`;
    await request(app)
      .put('/api/media-kit/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, isPublic: true });

    const publicRes = await request(app).get(`/api/media-kit/public/${slug}`);

    expect(publicRes.status).toBe(200);
    expect(publicRes.body.mediaKit.slug).toBe(slug);
    expect(publicRes.body.mediaKit.user).toHaveProperty('name');
  });

  it('Deve cadastrar uma rede social no Mídia Kit', async () => {
    const response = await request(app)
      .post('/api/media-kit/social-networks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'INSTAGRAM',
        username: 'tech_creator',
        followersCount: 25000,
        engagementRate: 5.2,
      });

    expect(response.status).toBe(201);
    expect(response.body.socialNetwork.platform).toBe('INSTAGRAM');
    expect(response.body.socialNetwork.followersCount).toBe(25000);
  });
});