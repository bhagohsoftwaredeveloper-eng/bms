import { IsString } from 'class-validator';

export class AddReportFeedbackDto {
  @IsString()
  message!: string;
}
