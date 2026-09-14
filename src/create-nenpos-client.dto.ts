import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateNenposClientDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  license?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  installer?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsDateString()
  installDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trialDays?: number;
}
