import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDevProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  developerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetHours?: number | null;

  @IsOptional()
  @IsDateString()
  projectStart?: string | null;

  @IsOptional()
  @IsDateString()
  projectDeadline?: string | null;
}
