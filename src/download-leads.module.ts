import { Module } from '@nestjs/common';
import { DownloadLeadsController } from './download-leads.controller';
import { DownloadLeadsService } from './download-leads.service';

@Module({
  controllers: [DownloadLeadsController],
  providers: [DownloadLeadsService],
})
export class DownloadLeadsModule {}
