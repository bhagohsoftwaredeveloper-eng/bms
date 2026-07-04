import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { ResetService } from './reset.service';

@Module({
  controllers: [BackupsController],
  providers: [BackupsService, ResetService],
})
export class BackupsModule {}
