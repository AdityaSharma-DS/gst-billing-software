import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { CurrentUser } from '../../common/auth/user.decorator';
import { IrnService } from './irn.service';

@Controller('einvoice')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IrnController {
  constructor(private readonly irn: IrnService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.irn.list(tenantId);
  }

  @Post(':billId/generate')
  @Roles('ADMIN', 'ACCOUNTANT')
  generate(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('billId') billId: string) {
    return this.irn.generate(tenantId, billId, user?.id);
  }
}
