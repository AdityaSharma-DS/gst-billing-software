import { Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { OrganizationService } from './organization.service';
import { MailService } from '../bills/mail.service';

@Controller('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(private readonly org: OrganizationService, private readonly mail: MailService) {}

  @Post('verify-smtp')
  @Roles('ADMIN')
  verifySmtp() {
    return this.mail.verify();
  }

  @Get()
  get(@CurrentTenant() tenantId: string) {
    return this.org.get(tenantId);
  }

  @Patch()
  @Roles('ADMIN')
  update(@CurrentTenant() tenantId: string, @Body() body: any) {
    return this.org.update(tenantId, body);
  }

  @Post('logo')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(@CurrentTenant() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.org.setLogo(tenantId, file);
  }
}
