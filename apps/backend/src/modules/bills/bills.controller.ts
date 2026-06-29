import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';

@Controller('bills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.bills.list(tenantId);
  }

  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.bills.get(tenantId, id);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateBillDto) {
    return this.bills.create(tenantId, dto);
  }
}
