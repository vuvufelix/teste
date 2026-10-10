import { Router } from 'express';
import { MediaKitController } from '../controllers/media-kit.controller.js';
import { ensureAuthenticated, checkSubscriptionOrTrial } from '../middlewares/auth.middleware.js';

const mediaKitRoutes = Router();

// Rota Pública (Acesso livre para Marcas/Agências)
mediaKitRoutes.get('/public/:slug', MediaKitController.getPublicMediaKit);

// Rotas Privadas (Exigem Autenticação e Trial/Assinatura Ativa)
mediaKitRoutes.use(ensureAuthenticated);
mediaKitRoutes.use(checkSubscriptionOrTrial);

mediaKitRoutes.get('/me', MediaKitController.getMyMediaKit);
mediaKitRoutes.put('/me', MediaKitController.updateMyMediaKit);
mediaKitRoutes.post('/me/images', MediaKitController.uploadImage);

mediaKitRoutes.post('/social-networks', MediaKitController.addSocialNetwork);
mediaKitRoutes.put('/social-networks/:id', MediaKitController.updateSocialNetwork);
mediaKitRoutes.delete('/social-networks/:id', MediaKitController.deleteSocialNetwork);
mediaKitRoutes.post('/social-networks/:id/sync', MediaKitController.syncSocialNetwork);

export { mediaKitRoutes };