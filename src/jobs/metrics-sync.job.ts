import cron from 'node-cron';
import { prisma } from '../config/prisma.js';
import { SocialStatsService } from '../services/social-stats.service.js';

export const startMetricsSyncCron = () => {
  // Executa diariamente às 03:00 da manhã
  cron.schedule('0 3 * * *', async () => {
    console.log('⏰ [CRON JOB] Iniciando atualização diária de métricas...');

    try {
      const activeNetworks = await prisma.socialNetwork.findMany({
        where: {
          mediaKit: {
            user: {
              subscriptionStatus: 'ACTIVE',
            },
          },
        },
      });

      console.log(`📊 Encontradas ${activeNetworks.length} redes para sincronizar.`);

      for (const network of activeNetworks) {
        // 👈 Fallback seguro garantindo que o tipo seja estritamente 'string'
        const targetUrlOrHandle = network.profileUrl || network.handle || '';

        const stats = await SocialStatsService.fetchStats(
          network.platform,
          targetUrlOrHandle
        );

        await prisma.socialNetwork.update({
          where: { id: network.id },
          data: {
            followersCount: stats.followersCount || network.followersCount,
            engagementRate: stats.engagementRate || network.engagementRate,
            monthlyViews: stats.monthlyViews ?? network.monthlyViews,
            lastUpdated: new Date(),
          },
        });
      }

      console.log('✅ [CRON JOB] Sincronização diária concluída.');
    } catch (error) {
      console.error('❌ [CRON JOB] Erro na sincronização automática:', error);
    }
  });
};