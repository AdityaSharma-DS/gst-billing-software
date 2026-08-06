import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { PaymentsService } from './payments.service';

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.payments.listAll(tenantId);
  }
}
