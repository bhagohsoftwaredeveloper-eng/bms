import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLicenseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseKey?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;
}
