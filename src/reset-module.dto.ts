import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetModuleDto {
  /** The requesting Super Admin's own login password — verified before any data is wiped. */
  @IsString()
  @MinLength(1)
  password!: string;

  /** Filename of the backup the client already created/downloaded, reused instead of re-dumping. */
  @IsOptional()
  @IsString()
  backupFilename?: string;
}
