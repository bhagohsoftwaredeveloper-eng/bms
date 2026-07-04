import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { KpisController } from './kpis.controller';
import { KpisService } from './kpis.service';

@Module({
  imports: [PrismaModule],
  controllers: [KpisController],
  providers: [KpisService],
})
export class KpisModule {}
