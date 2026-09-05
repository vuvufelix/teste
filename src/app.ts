import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';

const app = express();

// Middlewares de Segurança e Parsing
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Rota de Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Tratador global de rotas não encontradas (404)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Rota não encontrada',
  });
});

// Tratador global de erros (500)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro interno na aplicação:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;