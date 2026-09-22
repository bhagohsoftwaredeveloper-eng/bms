import { Module } from '@nestjs/common';
import { PayrollModule } from './payroll.module';
import { PrismaModule } from './prisma.module';
import { WithdrawalsModule } from './withdrawals.module';
import { KpisController } from './kpis.controller';
import { KpisService } from './kpis.service';

@Module({
  imports: [PrismaModule, PayrollModule, WithdrawalsModule],
  controllers: [KpisController],
  providers: [KpisService],
})
export class KpisModule {}
