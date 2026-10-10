import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SubscriptionStatus, Role } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

interface JwtPayload {
  userId: string;
  role: string;
}

// 1. Garante que o usuário está autenticado via Token JWT
export async function ensureAuthenticated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Token com payload inválido.' });
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    // Log útil no terminal para entender por que o JWT falhou durante o desenvolvimento
    console.error('❌ Erro na validação do JWT:', (error as Error).message);
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }
}

// 2. Garante que o usuário autenticado possui perfil de Administrador (ADMIN ou SUPER_ADMIN)
export async function ensureAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  // ✅ Aceita tanto ADMIN quanto SUPER_ADMIN
  const isAdmin = req.user.role === Role.SUPER_ADMIN || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Acesso negado. Apenas administradores têm permissão para acessar esta funcionalidade.',
    });
  }

  return next();
}

// 3. Garante que o usuário possui um Plano Ativo ou Período de Testes (Trial) Válido
export async function checkSubscriptionOrTrial(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  // ✅ Administradores têm acesso livre ilimitado
  const isAdmin = req.user.role === Role.SUPER_ADMIN || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
  if (isAdmin) {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        subscriptionStatus: true, 
        trialEndsAt: true 
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const now = new Date();
    const isTrialValid = user.trialEndsAt && new Date(user.trialEndsAt) > now;
    const isSubscriptionActive = user.subscriptionStatus === SubscriptionStatus.ACTIVE;

    if (!isTrialValid && !isSubscriptionActive) {
      return res.status(402).json({
        error: 'Seu período de avaliação gratuita expirou. Por favor, assine um plano para continuar utilizando este serviço.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}