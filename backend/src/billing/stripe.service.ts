import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

// Intégration Stripe (paiements carte). PayPal et crypto (BTC/SOL) sont
// modélisés dans le schéma (PaymentProvider) mais leur intégration complète
// (webhooks PayPal IPN, wallets on-chain) reste à implémenter — voir
// docs/architecture pour le suivi.
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {
    const secretKey = config.get<string>('stripe.secretKey');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe)
      throw new BadRequestException(
        'Stripe non configuré (STRIPE_SECRET_KEY manquant)',
      );
    return this.stripe;
  }

  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const stripe = this.requireStripe();
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { id: planId },
      include: { product: true },
    });

    const session = await stripe.checkout.sessions.create({
      mode: plan.billingCycle === 'ONE_TIME' ? 'payment' : 'subscription',
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            unit_amount: plan.priceCents,
            product_data: { name: `${plan.product.name} — ${plan.name}` },
            ...(plan.billingCycle !== 'ONE_TIME' && {
              recurring: {
                interval: this.mapCycleToStripeInterval(plan.billingCycle),
              },
            }),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId, planId },
    });

    return { checkoutUrl: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('stripe.webhookSecret');
    if (!webhookSecret)
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET manquant');

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Événement Stripe ignoré: ${event.type}`);
    }
    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (!userId || !planId) return;

    await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        stripeSubscriptionId:
          typeof session.subscription === 'string'
            ? session.subscription
            : undefined,
      },
    });
  }

  private async onInvoicePaid(stripeInvoice: Stripe.Invoice) {
    const subscriptionId =
      typeof stripeInvoice.parent?.subscription_details?.subscription ===
      'string'
        ? stripeInvoice.parent.subscription_details.subscription
        : undefined;
    if (!subscriptionId) return;

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!subscription) return;

    await this.prisma.invoice.create({
      data: {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        number: await this.billing.createInvoiceNumber(),
        status: 'PAID',
        subtotalCents: stripeInvoice.subtotal,
        taxCents: (stripeInvoice.total_taxes ?? []).reduce(
          (sum, t) => sum + t.amount,
          0,
        ),
        totalCents: stripeInvoice.total,
        currency: stripeInvoice.currency.toUpperCase(),
        provider: 'STRIPE',
        providerRef: stripeInvoice.id,
        paidAt: new Date(),
      },
    });
  }

  private mapCycleToStripeInterval(
    cycle: string,
  ): Stripe.Price.Recurring.Interval {
    switch (cycle) {
      case 'YEARLY':
        return 'year';
      case 'WEEKLY':
        return 'week';
      case 'DAILY':
        return 'day';
      default:
        return 'month';
    }
  }
}
