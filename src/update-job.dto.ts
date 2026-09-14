import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class UpdateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  installerId?: string | null;

  @Type(() => Date)
  @IsDate()
  scheduleDate!: Date;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}