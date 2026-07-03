import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { CurrentUser } from '../../common/auth/user.decorator';
import { BillsService } from './bills.service';
import { InvoiceService } from './invoice.service';
import { ImportService } from './import.service';
import { MailService } from './mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateStatusDto } from './dto/update-bill.dto';

@Controller('bills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly invoices: InvoiceService,
    private readonly importer: ImportService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query('direction') direction?: 'INCOMING' | 'OUTGOING',
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('partyId') partyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bills.list(tenantId, { direction, status, search, partyId, from, to });
  }

  @Get('import/template')
  template(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bill-import-template.csv"');
    res.send(this.importer.templateCsv());
  }

  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.bills.get(tenantId, id);
  }

  @Get(':id/invoice.pdf')
  async pdf(@CurrentTenant() tenantId: string, @Param('id') id: string, @Res() res: Response) {
    const bill = await this.bills.get(tenantId, id);
    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    const buf = await this.invoices.render(bill, org);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNumber}.pdf"`);
    res.send(buf);
  }

  @Post()
  @Roles('ADMIN', 'ACCOUNTANT')
  create(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateBillDto) {
    return this.bills.create(tenantId, dto, user?.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  update(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateBillDto) {
    return this.bills.update(tenantId, id, dto, user?.id);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'ACCOUNTANT')
  setStatus(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.bills.setStatus(tenantId, id, dto.status, user?.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ACCOUNTANT')
  remove(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.bills.remove(tenantId, id, user?.id);
  }

  @Post(':id/email')
  @Roles('ADMIN', 'ACCOUNTANT')
  async email(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: { to?: string }) {
    const bill = await this.bills.get(tenantId, id);
    const to = body?.to || bill.party?.email;
    if (!to) return { sent: false, reason: 'No recipient email (add one to the client or pass "to")' };
    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    const pdf = await this.invoices.render(bill, org);
    return this.mail.sendInvoice(to, `${bill.billNumber}.pdf`, pdf, `Invoice ${bill.billNumber}`);
  }

  @Post('import')
  @Roles('ADMIN', 'ACCOUNTANT')
  import(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Body() body: { csv: string; direction: 'INCOMING' | 'OUTGOING' }) {
    return this.importer.importCsv(tenantId, body.csv, body.direction ?? 'OUTGOING', user?.id);
  }
}
