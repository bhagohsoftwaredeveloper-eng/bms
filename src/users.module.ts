import { Module } from '@nestjs/common';
import { PayrollModule } from './payroll.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PayrollModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
