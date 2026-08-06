import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('search') search?: string) {
    return this.products.list(tenantId, search);
  }

  @Get('barcode/:code')
  byBarcode(@CurrentTenant() tenantId: string, @Param('code') code: string) {
    return this.products.findByBarcode(tenantId, code);
  }

  @Get('import/template')
  template(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-template.csv"');
    res.send(this.products.templateCsv());
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @Body() body: any) {
    return this.products.create(tenantId, body);
  }

  @Post('import')
  @Roles('ADMIN', 'ACCOUNTANT')
  import(@CurrentTenant() tenantId: string, @Body() body: { csv: string }) {
    return this.products.importCsv(tenantId, body.csv);
  }

  @Patch(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: any) {
    return this.products.update(tenantId, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.products.remove(tenantId, id);
  }
}
