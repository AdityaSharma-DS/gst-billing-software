import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { MailService } from '../bills/mail.service';

@Controller('admin')
export class PlatformController {
  constructor(private readonly platform: PlatformService, private readonly mail: MailService) {}

  // Public: master admin login — tight rate limit against brute force.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  // ── Email / SMTP ──
  @Get('smtp-config')
  @UseGuards(PlatformAuthGuard)
  smtpConfig() {
    return this.platform.getSmtpConfigMasked();
  }

  @Put('smtp-config')
  @UseGuards(PlatformAuthGuard)
  setSmtpConfig(@Body() body: any) {
    return this.platform.setSmtpConfig(body);
  }

  @Post('smtp-config/test')
  @UseGuards(PlatformAuthGuard)
  testSmtp() {
    return this.mail.verify();
  }

  // ── WhatsApp (Twilio) ──
  @Get('whatsapp-config')
  @UseGuards(PlatformAuthGuard)
  whatsappConfig() {
    return this.platform.getWhatsappConfigMasked();
  }

  @Put('whatsapp-config')
  @UseGuards(PlatformAuthGuard)
  setWhatsappConfig(@Body() body: any) {
    return this.platform.setWhatsappConfig(body);
  }
}
