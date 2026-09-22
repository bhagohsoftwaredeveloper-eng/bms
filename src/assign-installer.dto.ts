import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AssignInstallerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installerIds!: string[];
}
