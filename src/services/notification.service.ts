import webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:suporte@influkit.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export class NotificationService {
  // Envia notificação Push para todos os dispositivos de um utilizador específico
  static async sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const notificationPayload = JSON.stringify(payload);

    const sendPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushConfig, notificationPayload);
      } catch (error: any) {
        // Se a subscrição expirar ou for revogada no navegador, remove do banco
        if (error.statusCode === 410 || error.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
        console.error(`Erro ao enviar Push para a subscrição ${sub.id}:`, error);
      }
    });

    await Promise.all(sendPromises);
  }
}