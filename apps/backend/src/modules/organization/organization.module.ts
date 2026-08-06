import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { MailService } from '../bills/mail.service';

@Module({
  imports: [ConfigModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, MailService],
})
export class OrganizationModule {}
