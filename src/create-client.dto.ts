import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ClientType } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  clientCode!: string;

  @IsString()
  businessName!: string;

  @IsString()
  ownerName!: string;

  @IsString()
  contactNo!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  /** How many computers/terminals this business runs — independent of license count. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  computerCount?: number;
}
