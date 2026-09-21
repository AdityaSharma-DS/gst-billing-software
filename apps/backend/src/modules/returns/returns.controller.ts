import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { ReturnsService } from './returns.service';

@Controller('returns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.returns.list(tenantId);
  }

  @Get('compliance')
  compliance(@CurrentTenant() tenantId: string) {
    return this.returns.compliance(tenantId);
  }

  @Post('generate')
  @Roles('ADMIN', 'ACCOUNTANT')
  generate(@CurrentTenant() tenantId: string, @Body() body: { returnType: any; period: string }) {
    return this.returns.generate(tenantId, body.returnType, body.period);
  }

  @Post('reconcile-2b')
  @Roles('ADMIN', 'ACCOUNTANT')
  reconcile2b(@CurrentTenant() tenantId: string, @Body() body: { period: string; gstr2b: any }) {
    return this.returns.reconcile2b(tenantId, body.period, body.gstr2b);
  }

  @Get(':id/json')
  async json(@CurrentTenant() tenantId: string, @Param('id') id: string, @Res() res: Response) {
    const { filename, json } = await this.returns.json(tenantId, id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  }

  @Post(':id/file')
  @Roles('ADMIN', 'ACCOUNTANT')
  markFiled(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: { arn?: string }) {
    return this.returns.markFiled(tenantId, id, body?.arn);
  }

  // ── Portal filing (OTP + EVC) ──

  /** Step 1 — request the login OTP. */
  @Post(':id/file/start')
  @Roles('ADMIN', 'ACCOUNTANT')
  startFiling(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.returns.startFiling(tenantId, id);
  }

  /** Step 2 — verify the login OTP, save the return, and trigger the EVC OTP. */
  @Post(':id/file/verify')
  @Roles('ADMIN', 'ACCOUNTANT')
  verifyFiling(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: { txn: string; otp: string }) {
    return this.returns.verifyFiling(tenantId, id, body?.txn, body?.otp);
  }

  /** Step 3 — file with the EVC OTP and record the ARN. */
  @Post(':id/file/confirm')
  @Roles('ADMIN', 'ACCOUNTANT')
  confirmFiling(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: { txn: string; evcOtp: string }) {
    return this.returns.confirmFiling(tenantId, id, body?.txn, body?.evcOtp);
  }
}
