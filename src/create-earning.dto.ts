import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EarningType } from '@prisma/client';

export class CreateEarningDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsEnum(EarningType)
  type!: EarningType;
}
