import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';
import { mediaKitRoutes } from './routes/media-kit.routes.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' })); // Limite expandido para suportar upload base64
app.use(cookieParser());

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/media-kit', mediaKitRoutes);

// Rota de Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Rota não encontrada',
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro interno na aplicação:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;