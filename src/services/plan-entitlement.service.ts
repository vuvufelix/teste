import { prisma } from '../config/prisma.js';

export class PlanEntitlementService {
  /**
   * Obtém o plano ativo e valida o estado da subscrição do utilizador.
   */
  static async getUserEntitlements(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plan: true },
    });

    if (!user) {
      return { authorized: false, status: 404, error: 'Utilizador não encontrado.' };
    }

    if (!user.plan) {
      return { authorized: false, status: 403, error: 'Utilizador sem plano atribuído.' };
    }

    // Verificar se a subscrição expirou (se aplicável)
    const isExpired = user.subscriptionStatus === 'EXPIRED' || 
      (user.subscriptionEndsAt && new Date() > user.subscriptionEndsAt);

    if (isExpired && user.plan.priceUSD > 0) {
      return { authorized: false, status: 403, error: 'A sua subscrição expirou. Por favor, renove o seu plano.' };
    }

    return {
      authorized: true,
      user,
      plan: user.plan,
      limits: {
        audience: user.plan.audience,
        maxSocialNetworks: user.plan.maxSocialNetworks,
        maxProposalsPerMonth: user.plan.maxProposalsPerMonth,
        maxCreators: user.plan.maxCreators,
        allowAI: user.plan.hasAIAssistant,
        customDomainAllowed: user.plan.customDomainAllowed,
        customizationLevel: user.plan.customizationLevel, // BASIC, INTERMEDIATE, ADVANCED
      },
    };
  }

  /**
   * 5.2. Valida o limite mensal de propostas comerciais de forma transacional/consistente.
   * Contam todas as propostas criadas no mês corrente (independentemente de estarem rascunho ou enviadas, para evitar bypass).
   */
  static async validateProposalLimit(userId: string): Promise<{ allowed: boolean; status?: number; error?: string }> {
    const entitlement = await this.getUserEntitlements(userId);
    if (!entitlement.authorized) {
      return { allowed: false, status: entitlement.status, error: entitlement.error };
    }

    const maxProposals = entitlement.limits!.maxProposalsPerMonth;
    if (maxProposals === -1) {
      return { allowed: true }; // Ilimitado (ex: planos profissionais)
    }

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
        status: 403,
        error: `Limite atingido: o seu plano permite criar no máximo ${maxProposals} propostas por mês.`,
      };
    }

    return { allowed: true };
  }

  /**
   * 5.3. Valida se o plano atual tem permissão para utilizar o Assistente de IA.
   */
  static async validateAIAccess(userId: string): Promise<{ allowed: boolean; status?: number; error?: string }> {
    const entitlement = await this.getUserEntitlements(userId);
    if (!entitlement.authorized) {
      return { allowed: false, status: entitlement.status, error: entitlement.error };
    }

    if (!entitlement.limits!.allowAI) {
      return {
        allowed: false,
        status: 403,
        error: 'O seu plano atual não inclui acesso ao Assistente de Inteligência Artificial. Faça upgrade para o plano Profissional.',
      };
    }

    return { allowed: true };
  }

  /**
   * Valida o limite de redes sociais associadas ao Media Kit.
   */
  static async validateSocialNetworkLimit(userId: string): Promise<{ allowed: boolean; status?: number; error?: string }> {
    const entitlement = await this.getUserEntitlements(userId);
    if (!entitlement.authorized) {
      return { allowed: false, status: entitlement.status, error: entitlement.error };
    }

    const maxNetworks = entitlement.limits!.maxSocialNetworks;
    if (maxNetworks === -1) return { allowed: true };

    const mediaKit = await prisma.mediaKit.findUnique({
      where: { userId },
      include: { socialNetworks: true },
    });

    const currentCount = mediaKit?.socialNetworks.length || 0;

    if (currentCount >= maxNetworks) {
      return {
        allowed: false,
        status: 403,
        error: `Atingiu o limite de ${maxNetworks} redes sociais permitidas no seu plano.`,
      };
    }

    return { allowed: true };
  }
}