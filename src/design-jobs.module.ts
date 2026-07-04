import { Module } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';
import { DesignJobsController } from './design-jobs.controller';
import { DesignJobsService } from './design-jobs.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DesignJobsController],
  providers: [DesignJobsService],
})
export class DesignJobsModule {}
