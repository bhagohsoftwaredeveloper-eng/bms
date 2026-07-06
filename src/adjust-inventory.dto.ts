import { IsInt } from 'class-validator';

export class AdjustInventoryDto {
  /** Amount to add to stock (negative to remove). Result must not go below zero. */
  @IsInt()
  delta!: number;
}
