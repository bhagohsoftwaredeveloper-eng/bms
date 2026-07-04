import { UserRole } from '@prisma/client';
import { IsEnum, IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateKpiDefinitionDto {
  @IsEnum(UserRole) role!: UserRole;
  @IsString() @MinLength(1) name!: string;
  @IsNumber() @Min(0) @Max(100) weight!: number;
  @IsNumber() @Min(0.01) target!: number;
  @IsString() @MinLength(1) unit!: string;
}
