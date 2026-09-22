import { Type } from 'class-transformer';
import { IsNumber, Min, ValidateNested } from 'class-validator';

export class InstallationRateDto {
  @IsNumber()
  @Min(0)
  baseAmount!: number;

  @IsNumber()
  @Min(0)
  extraAmount!: number;
}

export class UpdateInstallationRatesDto {
  @ValidateNested()
  @Type(() => InstallationRateDto)
  INSIDE_TAGUM!: InstallationRateDto;

  @ValidateNested()
  @Type(() => InstallationRateDto)
  OUTSIDE_TAGUM!: InstallationRateDto;
}
