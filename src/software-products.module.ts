import { Module } from '@nestjs/common';
import { SoftwareProductsController } from './software-products.controller';
import { SoftwareProductsService } from './software-products.service';

@Module({
  controllers: [SoftwareProductsController],
  providers: [SoftwareProductsService],
})
export class SoftwareProductsModule {}
