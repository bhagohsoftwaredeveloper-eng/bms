import { IsOptional, IsString, MinLength } from 'class-validator';

/** Shared body for secure void / transfer actions — password re-check + typed confirmation phrase. */
export class VoidTransferActionDto {
  /** The acting admin's own login password — verified against their stored hash. */
  @IsString()
  @MinLength(1)
  password!: string;

  /** Must exactly match the client/business name to authorize the action. */
  @MinLength(1)
  confirmName!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Set only by the NENPOS → Bhagoh transfer finish step, so the record shows "Transferred". */
  @IsOptional()
  @IsString()
  transferredToLicenseId?: string;
}
