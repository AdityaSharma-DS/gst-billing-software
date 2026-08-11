import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('ADMIN')
  list(@CurrentTenant() tenantId: string, @Query('entity') entity?: string, @Query('action') action?: string, @Query('limit') limit?: string) {
    return this.audit.list(tenantId, { entity, action, limit: limit ? Number(limit) : undefined });
  }

  @Get('export')
  @Roles('ADMIN')
  async export(@CurrentTenant() tenantId: string, @Req() req: any, @Res() res: Response) {
    const csv = await this.audit.exportCsv(tenantId, req.user?.sub);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}
