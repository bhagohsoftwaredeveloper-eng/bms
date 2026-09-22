import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class UpdateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  installerIds?: string[] | null;

  @Type(() => Date)
  @IsDate()
  scheduleDate!: Date;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}
