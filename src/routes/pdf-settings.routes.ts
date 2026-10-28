import { Router } from 'express';
import { PdfSettingsController } from '../controllers/pdf-settings.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const pdfSettingsRoutes = Router();

// Exigir autenticação em todas as rotas
pdfSettingsRoutes.use(ensureAuthenticated);

pdfSettingsRoutes.get('/', PdfSettingsController.getSettings);
pdfSettingsRoutes.put('/', PdfSettingsController.updateSettings);

export { pdfSettingsRoutes };