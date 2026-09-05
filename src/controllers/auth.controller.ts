import { Request, Response } from 'express';
import argon2 from 'argon2';
import { prisma } from '../config/prisma.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/token.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { env } from '../config/env.js';

export class AuthController {
  static async register(req: Request, res: Response) {
    const parseResult = registerSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados enviados.',
        details: parseResult.error.format(),
      });
    }

    const { name, email, password, role } = parseResult.data;

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) {
      return res.status(409).json({ error: 'Já existe uma conta associada a este e-mail.' });
    }

    const passwordHash = await argon2.hash(password);

    // Regra de Negócio: Trial de 14 dias
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        subscriptionStatus: 'TRIALING',
        trialEndsAt,
      },
    });

    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id, role: user.role });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
      },
      accessToken,
    });
  }

  static async login(req: Request, res: Response) {
    const parseResult = loginSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Erro de validação nos dados enviados.',
        details: parseResult.error.format(),
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const passwordMatch = await argon2.verify(user.passwordHash, password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id, role: user.role });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
      },
      accessToken,
    });
  }

  static async refreshToken(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh Token não informado.' });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.refreshTokenHash) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const isRefreshTokenValid = await argon2.verify(user.refreshTokenHash, refreshToken);
      if (!isRefreshTokenValid) {
        return res.status(401).json({ error: 'Refresh Token inválido ou revogado.' });
      }

      const newAccessToken = generateAccessToken({ sub: user.id, role: user.role });
      const newRefreshToken = generateRefreshToken({ sub: user.id, role: user.role });

      const newRefreshTokenHash = await argon2.hash(newRefreshToken);
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: newRefreshTokenHash },
      });

      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({ accessToken: newAccessToken });
    } catch (error) {
      return res.status(401).json({ error: 'Refresh Token expirado ou corrompido.' });
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response) {
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshTokenHash: null },
      });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return res.status(200).json({ message: 'Logout realizado com sucesso.' });
  }

  static async me(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ user });
  }
}