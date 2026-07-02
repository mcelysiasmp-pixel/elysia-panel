import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  @Get('products')
  @RequirePermissions('billing.read')
  listProducts() {
    return this.billing.listProducts();
  }

  @Post('products')
  @RequirePermissions('billing.manage')
  createProduct(@Body('name') name: string, @Body('description') description: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.createProduct(name, description, actor.id);
  }

  @Post('products/:productId/plans')
  @RequirePermissions('billing.manage')
  createPlan(@Param('productId') productId: string, @Body() body: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.createPlan(productId, body, actor.id);
  }

  @Post('coupons')
  @RequirePermissions('billing.manage')
  createCoupon(@Body() body: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.createCoupon(body, actor.id);
  }

  @Get('invoices')
  @RequirePermissions('billing.read')
  myInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listInvoicesForUser(user.id);
  }

  @Get('subscriptions')
  @RequirePermissions('billing.read')
  mySubscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listSubscriptionsForUser(user.id);
  }

  @Post('invoices/:id/refund')
  @RequirePermissions('billing.refund')
  refund(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.refundInvoice(id, actor.id);
  }

  @Post('checkout/:planId')
  @RequirePermissions('billing.read')
  checkout(
    @Param('planId') planId: string,
    @Body('successUrl') successUrl: string,
    @Body('cancelUrl') cancelUrl: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stripe.createCheckoutSession(user.id, planId, successUrl, cancelUrl);
  }

  @Public()
  @Post('webhooks/stripe')
  async stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.stripe.handleWebhook(req.rawBody!, signature);
  }
}
