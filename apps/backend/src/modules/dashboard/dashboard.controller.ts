import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentTenant() tenantId: string) {
    return this.dashboard.summary(tenantId);
  }
}
