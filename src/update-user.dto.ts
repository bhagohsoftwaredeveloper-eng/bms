import { IsArray, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
}
