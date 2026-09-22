import { Module } from '@nestjs/common';
import { EarningsModule } from './earnings.module';
import { NotificationsModule } from './notifications.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [NotificationsModule, EarningsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
