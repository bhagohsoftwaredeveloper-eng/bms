import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateLicenseDto {
  // License key is issued by the 3rd-party provider and entered manually.
  @IsString()
  @IsNotEmpty()
  licenseKey!: string;

  @IsString()
  clientId!: string;

  @IsString()
  productId!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;
}
