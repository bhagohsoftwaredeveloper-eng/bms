import { IsString } from 'class-validator';

export class AssignInstallerDto {
  @IsString()
  installerId!: string;
}
