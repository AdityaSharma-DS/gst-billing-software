import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { ExpensesService, ExpenseInput } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('category') category?: string, @Query('q') q?: string, @Query('fy') fy?: string) {
    return this.expenses.list(tenantId, { category, q, fy });
  }

  @Get('summary')
  summary(@CurrentTenant() tenantId: string) {
    return this.expenses.summary(tenantId);
  }

  @Get('export')
  async export(@CurrentTenant() tenantId: string, @Req() req: any, @Res() res: Response) {
    const csv = await this.expenses.exportCsv(tenantId, req.user?.sub);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @Body() body: ExpenseInput, @Req() req: any) {
    return this.expenses.create(tenantId, body, req.user?.sub);
  }

  @Patch(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: Partial<ExpenseInput>, @Req() req: any) {
    return this.expenses.update(tenantId, id, body, req.user?.sub);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string, @Req() req: any) {
    return this.expenses.remove(tenantId, id, req.user?.sub);
  }
}
