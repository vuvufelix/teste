import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rate-limit.middleware.js';

const authRoutes = Router();

authRoutes.post('/register', authLimiter, AuthController.register);
authRoutes.post('/login', authLimiter,AuthController.login);
authRoutes.post('/refresh', AuthController.refreshToken);
authRoutes.post('/logout', ensureAuthenticated, AuthController.logout);
authRoutes.get('/me', ensureAuthenticated, AuthController.me);
authRoutes.put('/profile', ensureAuthenticated, AuthController.updateProfile);
authRoutes.post('/forgot-password', authLimiter,AuthController.forgotPassword);
authRoutes.post('/reset-password', authLimiter, AuthController.resetPassword);
// Exemplo nas rotas de autenticação/perfil
authRoutes.delete('/account', ensureAuthenticated, AuthController.deleteAccount);

export { authRoutes };