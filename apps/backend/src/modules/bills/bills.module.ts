import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillsController } from './bills.controller';
import { ReceiptsController } from './receipts.controller';
import { EwayController } from './eway.controller';
import { IrnController } from './irn.controller';
import { BillsService } from './bills.service';
import { IrnService } from './irn.service';
import { InvoiceService } from './invoice.service';
import { ImportService } from './import.service';
import { MailService } from './mail.service';
import { PaymentsService } from './payments.service';
import { WhatsappService } from './whatsapp.service';
import { EwayService } from './eway.service';
import { GstModule } from '../gst/gst.module';
import { ProductsModule } from '../products/products.module';
import { GstnModule } from '../gstn/gstn.module';

@Module({
  imports: [GstModule, ConfigModule, ProductsModule, GstnModule],
  controllers: [BillsController, ReceiptsController, EwayController, IrnController],
  providers: [BillsService, InvoiceService, ImportService, MailService, PaymentsService, WhatsappService, EwayService, IrnService],
  exports: [BillsService],
})
export class BillsModule {}
