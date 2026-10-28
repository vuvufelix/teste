import { prisma } from '../config/prisma.js';
import { PlanAudience } from '@prisma/client';

export class SubscriptionService {
  /**
   * Atribui automaticamente o plano gratuito adequado com base no tipo de conta (Influenciador ou Agência)
   */
  static async assignDefaultFreePlan(userId: string, role: string) {
    const freeSlug = role === 'AGENCY' ? 'agency-free' : 'influencer-free';
    
    const plan = await prisma.plan.findUnique({
      where: { slug: freeSlug },
    });

    if (!plan) return;

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14 dias de trial opcional se aplicável

    await prisma.user.update({
      where: { id: userId },
      data: {
        planId: plan.id,
        subscriptionStatus: 'ACTIVE',
        subscriptionEndsAt: null, // Plano gratuito não expira por falta de pagamento
      },
    });
  }

  /**
   * Verifica se o utilizador possui permissão para executar uma determinada ação com base no seu plano ativo
   */
  static async checkUserEntitlements(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plan: true },
    });

    if (!user || !user.plan) {
      return { authorized: false, error: 'Plano não encontrado ou utilizador sem plano atribuído.' };
    }

    // Verificar se a subscrição paga expirou
    if (user.subscriptionStatus === 'EXPIRED' || (user.subscriptionEndsAt && new Date() > user.subscriptionEndsAt)) {
      return { authorized: false, error: 'A sua subscrição expirou. Por favor, renove o seu plano.' };
    }

    return {
      authorized: true,
      plan: user.plan,
      role: user.role,
      limits: {
        maxSocialNetworks: user.plan.maxSocialNetworks,
        maxProposalsPerMonth: user.plan.maxProposalsPerMonth,
        maxCreators: user.plan.maxCreators,
        allowAI: user.plan.hasAIAssistant,
        customDomainAllowed: user.plan.customDomainAllowed,
        customizationLevel: user.plan.customizationLevel,
      },
    };
  }

  /**
   * Valida se o utilizador pode criar uma nova proposta este mês
   */
  static async canCreateProposal(userId: string): Promise<{ allowed: boolean; error?: string }> {
    const entitlement = await this.checkUserEntitlements(userId);
    if (!entitlement.authorized || !entitlement.limits) {
      return { allowed: false, error: entitlement.error || 'Não autorizado.' };
    }

    const maxProposals = entitlement.limits.maxProposalsPerMonth;
    if (maxProposals === -1) return { allowed: true }; // Ilimitado

    // Contar propostas criadas no mês atual
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const proposalCount = await prisma.proposal.count({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
    });

    if (proposalCount >= maxProposals) {
      return { 
        allowed: false, 
        error: `Atingiu o limite de ${maxProposals} propostas comerciais permitidas no seu plano atual para este mês.` 
      };
    }

    return { allowed: true };
  }

  /**
   * Valida se a agência pode gerir mais criadores
   */
  static async canManageMoreCreators(agencyId: string): Promise<{ allowed: boolean; error?: string }> {
    const entitlement = await this.checkUserEntitlements(agencyId);
    if (!entitlement.authorized || !entitlement.limits) {
      return { allowed: false, error: entitlement.error || 'Não autorizado.' };
    }

    const maxCreators = entitlement.limits.maxCreators;
    
    const activeCreatorsCount = await prisma.agencyDelegation.count({
      where: {
        agencyId,
        status: 'ACCEPTED',
      },
    });

    if (activeCreatorsCount >= maxCreators) {
      return {
        allowed: false,
        error: `Atingiu o limite máximo de ${maxCreators} criadores geridos no seu plano de agência.`,
      };
    }

    return { allowed: true };
  }
}