import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Post('generate')
  @Roles('ADMIN', 'ACCOUNTANT')
  generate(@CurrentTenant() tenantId: string, @Body() body: { returnType: any; period: string }) {
    return this.returns.generate(tenantId, body.returnType, body.period);
  }
}
