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
}
