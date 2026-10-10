import app from './app.js';
import { startMetricsSyncCron } from './jobs/metrics-sync.job.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  startMetricsSyncCron();
  console.log(`🚀 Servidor rodando na porta ${env.PORT} em modo ${env.NODE_ENV}`);
});