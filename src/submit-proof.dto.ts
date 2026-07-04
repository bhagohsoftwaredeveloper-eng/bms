import { IsArray, IsObject, IsOptional, IsString, IsNumber } from 'class-validator';

export class SubmitProofDto {
  @IsOptional()
  @IsString()
  clientSignature?: string;

  @IsArray()
  @IsString({ each: true })
  photoUrls!: string[];

  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  gpsLatitude?: number;

  @IsOptional()
  @IsNumber()
  gpsLongitude?: number;
}
