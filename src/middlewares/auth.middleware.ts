import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token.js';
import { prisma } from '../config/prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    subscriptionStatus: string;
    trialEndsAt: Date;
  };
}

export async function ensureAuthenticated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido ou em formato inválido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, subscriptionStatus: true, trialEndsAt: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }
}

export function checkRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado. Permissão insuficiente.' });
    }

    return next();
  };
}

export function checkSubscriptionOrTrial(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  // Super Admin tem acesso irrestrito
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Se a assinatura estiver ativa
  if (req.user.subscriptionStatus === 'ACTIVE') {
    return next();
  }

  // Se estiver em período de Trial, verificar data limite
  if (req.user.subscriptionStatus === 'TRIALING') {
    const now = new Date();
    if (req.user.trialEndsAt > now) {
      return next();
    }
  }

  return res.status(402).json({
    error: 'Período de teste de 14 dias expirou. Por favor, assine um plano para continuar utilizando a plataforma.',
    code: 'TRIAL_EXPIRED',
  });
}