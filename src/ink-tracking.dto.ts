import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class RecordInkUsageDto {
  @IsNumber()
  @IsPositive()
  amountUsed: number; // in cc, supports decimals (e.g., 0.0003)

  @IsOptional()
  @IsString()
  jobReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResetInkUsageDto {
  @IsNumber()
  @Min(0)
  newUsage: number; // default 0, but allow admin to set custom value

  @IsOptional()
  @IsString()
  notes?: string;
}
