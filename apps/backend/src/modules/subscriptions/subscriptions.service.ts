import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Subscription + payment-gateway integration (Razorpay/PayU/Stripe).
 * Webhook handling updates payment + subscription status.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  listPlans() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceInr: 'asc' } });
  }

  getForTenant(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    );
  }

  /**
   * Record a tenant's request to switch plans. Actual activation is handled by
   * the platform operator (no self-serve checkout until a payment gateway is
   * wired), so this just logs an auditable request the operator can action.
   */
  async requestChange(tenantId: string, planId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.audit.record({
      tenantId, action: 'CREATE', entity: 'SubscriptionChangeRequest', entityId: planId,
      after: { requestedPlan: plan.name, priceInr: Number(plan.priceInr), interval: plan.interval },
    });
    return { requested: true, plan: plan.name, message: `Requested switch to ${plan.name}. Our team will reach out to confirm and activate it.` };
  }

  // TODO: createOrder(provider), handleWebhook(provider, payload), upgrade/downgrade, renewal.
}
