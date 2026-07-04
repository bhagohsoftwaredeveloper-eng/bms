import { DesignJobStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AddDesignJobUpdateDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(DesignJobStatus)
  status?: DesignJobStatus;
}
