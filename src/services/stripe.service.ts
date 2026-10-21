import Stripe from 'stripe';
import { env } from '../config/env.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY || '');

export class StripeService {
  /**
   * Cria uma sessão oficial de Checkout na Stripe
   */
  static async createCheckoutSession(params: {
    planName: string;
    amountUSD: number;
    userEmail: string;
    userId: string;
    planId: string;
  }) {
    const { planName, amountUSD, userEmail, userId, planId } = params;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Plano ${planName}`,
            },
            unit_amount: Math.round(amountUSD * 100), // Stripe aceita em centavos (ex: $10.00 -> 1000)
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        planId,
      },
      success_url: `${env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/payment/cancel`,
    });

    return session;
  }
}