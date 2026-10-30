import { IsEnum, IsString } from 'class-validator';
import { LicenseType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  productName!: string;

  @IsString()
  version!: string;

  @IsEnum(LicenseType)
  licenseType!: LicenseType;
}
