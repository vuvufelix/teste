import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { ensureAuthenticated, ensureAdmin } from '../middlewares/auth.middleware.js';

const adminRoutes = Router();

// Todas as rotas do módulo de admin exigem autenticação e nível 'ADMIN'
adminRoutes.use(ensureAuthenticated);
adminRoutes.use(ensureAdmin);

adminRoutes.get('/dashboard/stats', AdminController.getDashboardStats);
adminRoutes.get('/payments/pending', AdminController.getPendingPayments);
adminRoutes.post('/payments/:id/review', AdminController.reviewPaymentOrder);
adminRoutes.get('/users', AdminController.listUsers);
adminRoutes.patch('/users/:userId/plan', AdminController.updateUserPlan);
adminRoutes.delete('/users/:userId', AdminController.deleteUser);

export { adminRoutes };