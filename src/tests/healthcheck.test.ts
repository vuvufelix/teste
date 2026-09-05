import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('Healthcheck API', () => {
  it('Deve retornar HTTP 200 e informações do status da aplicação', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });

  it('Deve retornar HTTP 404 para rotas inexistentes', async () => {
    const response = await request(app).get('/rota-inexistente');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Rota não encontrada');
  });
});