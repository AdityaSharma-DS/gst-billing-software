import { Module } from '@nestjs/common';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { GstModule } from '../gst/gst.module';

@Module({
  imports: [GstModule],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
