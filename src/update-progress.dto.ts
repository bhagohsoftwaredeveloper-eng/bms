import { Max, Min } from 'class-validator';

export class UpdateProgressDto {
  @Min(0)
  @Max(100)
  progressPercent!: number;
}
