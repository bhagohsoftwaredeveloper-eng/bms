import { IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { WithdrawalMethod } from '@prisma/client';

export class CreateWithdrawalDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(WithdrawalMethod)
  method!: WithdrawalMethod;

  @IsString()
  accountName!: string;

  @IsString()
  accountNumber!: string;
}
