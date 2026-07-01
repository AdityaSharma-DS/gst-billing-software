import { Controller, Get, UseGuards } from '@nestjs/common';
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

  @Get('receivables')
  receivables(@CurrentTenant() tenantId: string) {
    return this.reports.receivables(tenantId);
  }
}
