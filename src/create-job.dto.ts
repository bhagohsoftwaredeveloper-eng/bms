import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  installerId?: string;

  @IsOptional()
  @IsString()
  licenseId?: string;

  @Type(() => Date)
  @IsDate()
  scheduleDate!: Date;

  @IsOptional()
  @IsString()
  remarks?: string;
}
