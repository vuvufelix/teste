import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const notificationRoutes = Router();


notificationRoutes.get('/vapid-public-key', NotificationController.getPublicKey);
notificationRoutes.use(ensureAuthenticated)
notificationRoutes.post('/subscribe', NotificationController.subscribe);
notificationRoutes.post('/unsubscribe', NotificationController.unsubscribe);

export { notificationRoutes };