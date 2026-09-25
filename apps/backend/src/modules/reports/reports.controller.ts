import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { ReportsService } from './reports.service';
import { toCsv, toPdf } from './report-export.util';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** All report types the report centre offers, with availability. */
  @Get('catalog')
  catalog() {
    return this.reports.catalog();
  }

  /** Export a report as PDF (default) or CSV for the given date range. */
  @Get('export/:id')
  async export(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
    @Query('partyId') partyId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const to = toStr ? new Date(toStr) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = fromStr ? new Date(fromStr) : new Date(to.getFullYear(), to.getMonth(), 1);
    from.setHours(0, 0, 0, 0);

    const table = await this.reports.reportTable(tenantId, id, { from, to, partyId: partyId || undefined });
    const name = `${id}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;

    if ((format || 'pdf').toLowerCase() === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      return res.send('﻿' + toCsv(table)); // BOM so Excel reads UTF-8
    }
    const pdf = await toPdf(table);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    return res.send(pdf);
  }

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

  @Get('supply-classification')
  supplyClassification(@CurrentTenant() tenantId: string) {
    return this.reports.supplyClassification(tenantId);
  }

  @Get('itc-summary')
  itcSummary(@CurrentTenant() tenantId: string) {
    return this.reports.itcSummary(tenantId);
  }

  @Get('vendor-analytics')
  vendorAnalytics(@CurrentTenant() tenantId: string) {
    return this.reports.vendorAnalytics(tenantId);
  }

  @Get('receivables')
  receivables(@CurrentTenant() tenantId: string) {
    return this.reports.receivables(tenantId);
  }
}
