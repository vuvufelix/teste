import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // Desativa a execução paralela de arquivos de teste para evitar deadlocks/concorrência no banco de dados
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },

    // Aumenta o tempo limite de cada teste e de cada hook (ex: beforeEach/afterAll) para 15 segundos
    testTimeout: 15000,
    hookTimeout: 15000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});