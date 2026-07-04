import { IsOptional, IsString } from 'class-validator';

export class ReleaseWithdrawalDto {
  @IsOptional()
  @IsString()
  proofUrl?: string;
}
