import { Module } from '@nestjs/common';
import { JobOrdersController } from './job-orders.controller';
import { JobOrdersService } from './job-orders.service';
import { InventoryModule } from './inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [JobOrdersController],
  providers: [JobOrdersService],
})
export class JobOrdersModule {}
