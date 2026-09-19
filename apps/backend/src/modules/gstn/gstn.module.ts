import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhiteBooksService } from './whitebooks.service';
import { EInvoiceService } from './einvoice.service';
import { EWayBillService } from './ewaybill.service';
import { GstnController } from './gstn.controller';

@Module({
  imports: [ConfigModule],
  controllers: [GstnController],
  providers: [WhiteBooksService, EInvoiceService, EWayBillService],
  exports: [WhiteBooksService, EInvoiceService, EWayBillService],
})
export class GstnModule {}
