import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const authRoutes = Router();

authRoutes.post('/register', AuthController.register);
authRoutes.post('/login', AuthController.login);
authRoutes.post('/refresh', AuthController.refreshToken);
authRoutes.post('/logout', ensureAuthenticated, AuthController.logout);
authRoutes.get('/me', ensureAuthenticated, AuthController.me);

export { authRoutes };