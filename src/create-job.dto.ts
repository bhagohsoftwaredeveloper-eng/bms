import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  installerIds?: string[];

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
