import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { RecurringService, RecurringInput } from './recurring.service';

@Controller('recurring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.recurring.list(tenantId);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @Body() body: RecurringInput, @Req() req: any) {
    return this.recurring.create(tenantId, body, req.user?.sub);
  }

  @Patch(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: Partial<RecurringInput>, @Req() req: any) {
    return this.recurring.update(tenantId, id, body, req.user?.sub);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string, @Req() req: any) {
    return this.recurring.remove(tenantId, id, req.user?.sub);
  }

  @Post(':id/generate')
  @Roles('ADMIN', 'ACCOUNTANT')
  generate(@CurrentTenant() tenantId: string, @Param('id') id: string, @Req() req: any) {
    return this.recurring.generateNow(tenantId, id, req.user?.sub);
  }
}
