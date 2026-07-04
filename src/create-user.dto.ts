import { IsArray, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  additionalRoles?: UserRole[];

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseBonus?: number;
}
