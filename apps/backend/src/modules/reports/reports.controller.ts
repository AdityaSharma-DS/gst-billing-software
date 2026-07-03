import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('pnl')
  pnl(@CurrentTenant() tenantId: string) {
    return this.reports.profitAndLoss(tenantId);
  }

  @Get('summary')
  summary(@CurrentTenant() tenantId: string, @Query('period') period?: 'daily' | 'weekly' | 'monthly') {
    return this.reports.summary(tenantId, period ?? 'monthly');
  }

  @Get('by-party')
  byParty(@CurrentTenant() tenantId: string, @Query('type') type?: 'VENDOR' | 'CUSTOMER') {
    return this.reports.byParty(tenantId, type ?? 'CUSTOMER');
  }

  @Get('tax-summary')
  taxSummary(@CurrentTenant() tenantId: string) {
    return this.reports.taxSummary(tenantId);
  }

  @Get('receivables')
  receivables(@CurrentTenant() tenantId: string) {
    return this.reports.receivables(tenantId);
  }
}
