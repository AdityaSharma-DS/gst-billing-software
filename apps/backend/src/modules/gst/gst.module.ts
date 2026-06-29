import { Module } from '@nestjs/common';
import { GstService } from './gst.service';

@Module({
  providers: [GstService],
  exports: [GstService],
})
export class GstModule {}
