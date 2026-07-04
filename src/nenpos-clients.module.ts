import { Module } from '@nestjs/common';
import { NenposClientsController } from './nenpos-clients.controller';
import { NenposClientsService } from './nenpos-clients.service';

@Module({
  controllers: [NenposClientsController],
  providers: [NenposClientsService],
})
export class NenposClientsModule {}
