import { IsString } from 'class-validator';

export class AssignDesignJobDto {
  @IsString()
  operatorId!: string;
}
