import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
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
}
