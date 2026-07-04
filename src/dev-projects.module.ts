import { Module } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';
import { DevProjectsController } from './dev-projects.controller';
import { DevProjectsService } from './dev-projects.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DevProjectsController],
  providers: [DevProjectsService],
})
export class DevProjectsModule {}
