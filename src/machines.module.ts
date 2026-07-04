import { Module } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MachinesService],
  controllers: [MachinesController],
  exports: [MachinesService],
})
export class MachinesModule {}
