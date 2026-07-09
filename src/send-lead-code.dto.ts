import { IsEmail } from 'class-validator';

export class SendLeadCodeDto {
  @IsEmail()
  email!: string;
}
