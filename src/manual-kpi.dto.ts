import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator';

export class ManualKpiDto {
  @IsString() userId!: string;
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsInt() @Min(2020) year!: number;
  @IsString() kpiName!: string;
  @IsNumber() @Min(0) actualValue!: number;
}
