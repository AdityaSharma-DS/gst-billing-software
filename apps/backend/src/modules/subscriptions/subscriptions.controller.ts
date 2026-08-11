import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { SubscriptionsService } from './subscriptions.service';

/** Tenant-facing billing: view plans, current subscription, request a change. */
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get('plans')
  plans() {
    return this.subs.listPlans();
  }

  @Get('subscription')
  subscription(@CurrentTenant() tenantId: string) {
    return this.subs.getForTenant(tenantId);
  }

  @Post('request-change')
  requestChange(@CurrentTenant() tenantId: string, @Body() body: { planId: string }, ) {
    return this.subs.requestChange(tenantId, body.planId);
  }
}
