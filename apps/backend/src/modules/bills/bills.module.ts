import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { InvoiceService } from './invoice.service';
import { ImportService } from './import.service';
import { MailService } from './mail.service';
import { GstModule } from '../gst/gst.module';

@Module({
  imports: [GstModule, ConfigModule],
  controllers: [BillsController],
  providers: [BillsService, InvoiceService, ImportService, MailService],
  exports: [BillsService],
})
export class BillsModule {}
