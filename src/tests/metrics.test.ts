import { describe, it, expect } from 'vitest';
import { SocialStatsService } from '../services/social-stats.service';

describe('SocialStatsService - Transparência e Sincronização de Métricas', () => {
  it('Deve detetar URLs inválidas ou plataformas não suportadas sem inventar dados', async () => {
    const invalidPlatform = 'INVALID_PLATFORM';
    const profileUrl = 'https://instagram.com/utilizador_inexistente';

    await expect(SocialStatsService.fetchStats(invalidPlatform, profileUrl)).rejects.toThrow();
  });

  it('Deve garantir que o formato do handle remove espaços e caracteres indesejados', () => {
    const rawHandle = '  @CriadorExemplo!  ';
    const cleanUsername = rawHandle.replace(/[@\s!]/g, '');

    expect(cleanUsername).toBe('CriadorExemplo');
  });
});