import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Subscription + payment-gateway integration (Razorpay/PayU/Stripe).
 * Webhook handling updates payment + subscription status.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return this.prisma.plan.findMany({ where: { isActive: true } });
  }

  getForTenant(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    );
  }

  // TODO: createOrder(provider), handleWebhook(provider, payload), upgrade/downgrade, renewal.
}
