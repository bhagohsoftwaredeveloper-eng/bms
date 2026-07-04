import { IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateKpiDefinitionDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
  @IsOptional() @IsNumber() @Min(0.01) target?: number;
  @IsOptional() @IsString() @MinLength(1) unit?: string;
}
