import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}
