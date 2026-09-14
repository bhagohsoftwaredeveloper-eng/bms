import { Module } from '@nestjs/common';
import { ItemPackagesController } from './item-packages.controller';
import { ItemPackagesService } from './item-packages.service';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ItemPackagesService],
  controllers: [ItemPackagesController],
  exports: [ItemPackagesService],
})
export class ItemPackagesModule {}
