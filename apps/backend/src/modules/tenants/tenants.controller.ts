import { Body, Controller, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // Public onboarding endpoint (rate-limit in production).
  @Post('onboard')
  onboard(@Body() body: any) {
    return this.tenants.onboard(body);
  }
}
