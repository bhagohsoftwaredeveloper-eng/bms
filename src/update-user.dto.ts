import { IsArray, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  additionalRoles?: UserRole[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseBonus?: number;

  // null unlinks the user from payroll; a number links them and pulls their daily rate.
  @IsOptional()
  @IsInt()
  @Min(1)
  payrollEmployeeId?: number | null;
}
