import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { LicenseCryptoService } from './license-crypto.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  imports: [AuthModule],
  controllers: [LicensesController],
  providers: [LicensesService, LicenseCryptoService],
  exports: [LicenseCryptoService],
})
export class LicensesModule {}
