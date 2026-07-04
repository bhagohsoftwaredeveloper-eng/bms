import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { IsString } from 'class-validator';

class HardwareFingerprintDto {
  @IsString()
  cpu!: string;

  @IsString()
  disk!: string;

  @IsString()
  mac!: string;
}

export class ActivateLicenseDto {
  @IsObject()
  @ValidateNested()
  @Type(() => HardwareFingerprintDto)
  fingerprint!: HardwareFingerprintDto;
}
