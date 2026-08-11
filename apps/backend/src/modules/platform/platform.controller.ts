import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';

@Controller('admin')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  // Public: master admin login
  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.platform.login(body.email, body.password);
  }

  @Get('overview')
  @UseGuards(PlatformAuthGuard)
  overview() {
    return this.platform.overview();
  }

  @Get('tenants')
  @UseGuards(PlatformAuthGuard)
  tenants() {
    return this.platform.tenants();
  }

  @Patch('tenants/:id/status')
  @UseGuards(PlatformAuthGuard)
  setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' }) {
    return this.platform.setTenantStatus(id, body.status);
  }

  @Post('tenants/:id/subscription')
  @UseGuards(PlatformAuthGuard)
  assign(@Param('id') id: string, @Body() body: { planId: string; months?: number }) {
    return this.platform.assignSubscription(id, body.planId, body.months);
  }

  @Get('plans')
  @UseGuards(PlatformAuthGuard)
  plans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  @UseGuards(PlatformAuthGuard)
  savePlan(@Body() body: any) {
    return this.platform.savePlan(body);
  }

  @Get('gst-config')
  @UseGuards(PlatformAuthGuard)
  gstConfig() {
    return this.platform.getGstConfigMasked();
  }

  @Put('gst-config')
  @UseGuards(PlatformAuthGuard)
  setGstConfig(@Body() body: any) {
    return this.platform.setGstConfig(body);
  }
}
