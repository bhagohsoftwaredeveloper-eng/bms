import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ChecklistItemDto {
  @IsString()
  label!: string;

  @IsBoolean()
  done!: boolean;
}

export class CreateDevReportDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist!: ChecklistItemDto[];

  @IsOptional()
  @IsString()
  taggedAdminId?: string;
}
