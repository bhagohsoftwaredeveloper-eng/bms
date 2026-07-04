import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JobStatus } from '@prisma/client';

export class UpdateJobStatusDto {
  @IsEnum(JobStatus)
  jobStatus!: JobStatus;

  @IsOptional()
  @IsString()
  remarks?: string;
}
