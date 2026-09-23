import { Module } from '@nestjs/common';
import { EventsModule } from './events.module';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

@Module({
  imports: [EventsModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
