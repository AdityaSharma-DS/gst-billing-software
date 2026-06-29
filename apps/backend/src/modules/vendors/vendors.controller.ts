import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { VendorsService } from './vendors.service';

@Controller('parties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('type') type?: 'VENDOR' | 'CUSTOMER') {
    return this.vendors.list(tenantId, type);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @Body() body: any) {
    return this.vendors.create(tenantId, body);
  }
}
