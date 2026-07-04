import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { LicenseType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  productName!: string;

  @IsString()
  version!: string;

  @IsEnum(LicenseType)
  licenseType!: LicenseType;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maintenanceFee?: number;
}
