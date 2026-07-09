import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CreateDownloadLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactPerson!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  contactNo!: string;

  @IsEmail()
  email!: string;

  /** Absent when code delivery was unavailable — the lead is stored unverified. */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsIn(['ANDROID_APK', 'DESKTOP_PWA'])
  platform!: string;
}
