import { Module } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
