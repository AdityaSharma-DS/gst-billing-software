import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GstnAuthService } from './gstn-auth.service';
import { EInvoiceService } from './einvoice.service';
import { EWayBillService } from './ewaybill.service';

@Module({
  imports: [ConfigModule],
  providers: [GstnAuthService, EInvoiceService, EWayBillService],
  exports: [EInvoiceService, EWayBillService],
})
export class GstnModule {}
