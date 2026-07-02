import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Produits / Plans --------------------------------------------------

  listProducts() {
    return this.prisma.product.findMany({
      where: { active: true },
      include: { plans: { where: { active: true } } },
    });
  }

  createProduct(
    name: string,
    description: string | undefined,
    actorId: string,
  ) {
    return this.prisma.product
      .create({ data: { name, description } })
      .then((p) => {
        this.audit.log({
          actorId,
          action: 'billing.product.create',
          targetType: 'Product',
          targetId: p.id,
        });
        return p;
      });
  }

  createPlan(
    productId: string,
    data: {
      name: string;
      priceCents: number;
      currency: string;
      billingCycle: string;
      cpuLimitPct: number;
      memoryLimitMb: number;
      diskLimitMb: number;
    },
    actorId: string,
  ) {
    return this.prisma.plan
      .create({
        data: { productId, ...data, billingCycle: data.billingCycle as any },
      })
      .then((plan) => {
        this.audit.log({
          actorId,
          action: 'billing.plan.create',
          targetType: 'Plan',
          targetId: plan.id,
        });
        return plan;
      });
  }

  // --- Coupons -------------------------------------------------------------

  createCoupon(
    data: {
      code: string;
      percentOff?: number;
      amountOffCents?: number;
      maxRedemptions?: number;
      expiresAt?: Date;
    },
    actorId: string,
  ) {
    return this.prisma.coupon.create({ data }).then((coupon) => {
      this.audit.log({
        actorId,
        action: 'billing.coupon.create',
        targetType: 'Coupon',
        targetId: coupon.id,
      });
      return coupon;
    });
  }

  async validateCoupon(code: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.active) return null;
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return null;
    if (coupon.maxRedemptions && coupon.timesRedeemed >= coupon.maxRedemptions)
      return null;
    return coupon;
  }

  // --- Abonnements / Factures ------------------------------------------

  listInvoicesForUser(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listSubscriptionsForUser(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { plan: { include: { product: true } } },
    });
  }

  async refundInvoice(invoiceId: string, actorId: string) {
    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID' },
    });
    await this.audit.log({
      actorId,
      action: 'billing.invoice.refund',
      targetType: 'Invoice',
      targetId: invoiceId,
      severity: 'WARNING',
    });
    return invoice;
  }

  async createInvoiceNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    const year = new Date().getFullYear();
    return `ELY-${year}-${(count + 1).toString().padStart(6, '0')}`;
  }
}
