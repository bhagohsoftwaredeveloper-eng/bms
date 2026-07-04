import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDevProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  developerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  targetHours?: number;
}
