import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const paymentRoutes = Router();

// Rota para receber Webhook do Stripe (Não requer autenticação do usuário)
paymentRoutes.post('/webhook/stripe', PaymentController.stripeWebhook);

// Rotas Autenticadas
paymentRoutes.use(ensureAuthenticated);

paymentRoutes.get('/bank-details', PaymentController.getBankDetails);
paymentRoutes.post('/stripe/checkout', PaymentController.createStripeCheckout);
paymentRoutes.post('/aoa/manual', PaymentController.createManualAOAPayment);
paymentRoutes.get('/history', PaymentController.getMyPayments);

export { paymentRoutes };