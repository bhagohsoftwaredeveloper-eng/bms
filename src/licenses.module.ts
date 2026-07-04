import { Module } from '@nestjs/common';
import { LicenseCryptoService } from './license-crypto.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  controllers: [LicensesController],
  providers: [LicensesService, LicenseCryptoService],
  exports: [LicenseCryptoService],
})
export class LicensesModule {}
