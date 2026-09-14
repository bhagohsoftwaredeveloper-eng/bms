import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { NenposClientsController } from './nenpos-clients.controller';
import { NenposClientsService } from './nenpos-clients.service';

@Module({
  imports: [AuthModule],
  controllers: [NenposClientsController],
  providers: [NenposClientsService],
})
export class NenposClientsModule {}
