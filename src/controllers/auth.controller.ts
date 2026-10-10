import { Request, Response } from 'express';
import argon2 from 'argon2';
import bcrypt from "bcrypt";
import { prisma } from '../config/prisma.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/token.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { env } from '../config/env.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.schema.js';
import crypto from 'crypto';
import { MailService } from '../services/mail.service.js';


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

    const passwordHash = await bcrypt.hash(password, 10);

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

    try {
      await MailService.sendWelcomeEmail(user.email, user.name);
    } catch (error) {
      console.error('Erro ao enviar e-mail de boas-vindas:', error);
    }

    const accessToken = generateAccessToken({ userId: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id, role: user.role });

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

    //const passwordMatch = await argon2.verify(user.passwordHash, password);
    
    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas. password' });
    }

    const accessToken = generateAccessToken({ userId: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id, role: user.role });

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

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || !user.refreshTokenHash) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const isRefreshTokenValid = await argon2.verify(user.refreshTokenHash, refreshToken);
      if (!isRefreshTokenValid) {
        return res.status(401).json({ error: 'Refresh Token inválido ou revogado.' });
      }

      const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });
      const newRefreshToken = generateRefreshToken({ userId: user.id, role: user.role });

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

  // 1. Solicitar redefinição de senha (envia o e-mail)
  static async forgotPassword(req: Request, res: Response) {
    const parseResult = forgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const { email } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Por segurança, sempre responder 200 para evitar que descubram se o e-mail existe
    if (!user) {
      return res.status(200).json({
        message: 'Se o e-mail estiver cadastrado em nosso sistema, você receberá um link para redefinir sua senha.',
      });
    }

    // Gerar token aleatório
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Validade de 1 hora
    const resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Salvar token e expiração no usuário
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash,
        resetPasswordExpiresAt,
      },
    });

    // Enviar o e-mail em segundo plano
    try {
      await MailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      console.error('❌ Erro ao enviar e-mail de recuperação:', error);
      return res.status(500).json({ error: 'Erro ao enviar e-mail de recuperação.' });
    }

    return res.status(200).json({
      message: 'Se o e-mail estiver cadastrado em nosso sistema, você receberá um link para redefinir sua senha.',
    });
  }

  // 2. Redefinir a senha com o token recebido
  static async resetPassword(req: Request, res: Response) {
    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: parseResult.error.format(),
      });
    }

    const { email, token, newPassword } = parseResult.data;

    // Gerar o mesmo hash para comparação
    const resetPasswordTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        email,
        resetPasswordTokenHash,
        resetPasswordExpiresAt: {
          gt: new Date(), // Verifica se ainda não expirou
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Token de redefinição inválido ou expirado.' });
    }

    // Criptografar a nova senha
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Atualizar a senha e invalidar o token usado
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        refreshTokenHash: null, // Desconecta sessões antigas
      },
    });

    return res.status(200).json({
      message: 'Senha redefinida com sucesso! Você já pode fazer login com sua nova senha.',
    });
  }
}