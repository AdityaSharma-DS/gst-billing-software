import { Module } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { BillsModule } from '../bills/bills.module';

@Module({
  imports: [BillsModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
