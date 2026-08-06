import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { CurrentUser } from '../../common/auth/user.decorator';
import { EwayService } from './eway.service';

@Controller('eway')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EwayController {
  constructor(private readonly eway: EwayService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.eway.list(tenantId);
  }

  @Post(':billId/generate')
  @Roles('ADMIN', 'ACCOUNTANT')
  generate(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('billId') billId: string, @Body() body: { vehicleNo?: string; transporterId?: string }) {
    return this.eway.generate(tenantId, billId, body ?? {}, user?.id);
  }
}
