import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class GenerateIncentivesDto {
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsInt() @Min(2020) year!: number;
  @IsOptional() @IsNumber() @Min(0) baseBonus?: number;
}
