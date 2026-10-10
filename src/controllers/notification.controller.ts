import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

export class NotificationController {
  // Devolve a chave pública VAPID para o frontend
  static async getPublicKey(req: AuthenticatedRequest, res: Response) {
    return res.status(200).json({
      publicKey: process.env.VAPID_PUBLIC_KEY,
    });
  }

  // Regista a subscrição Push do navegador/dispositivo do utilizador
  static async subscribe(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Dados de subscrição Push inválidos.' });
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return res.status(201).json({ message: 'Subscrição de notificações registada com sucesso.', subscription });
  }

  // Remove a subscrição ao desativar notificações
  static async unsubscribe(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });

    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint necessário.' });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });

    return res.status(200).json({ message: 'Notificações desativadas para este dispositivo.' });
  }
}