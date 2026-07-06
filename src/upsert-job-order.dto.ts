import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiscountType, JobOrderStatus } from '@prisma/client';

export class JobOrderItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  /** Links this line to an inventory item so stock deducts when the order completes. */
  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}

export class UpsertJobOrderDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsEnum(JobOrderStatus)
  status?: JobOrderStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobOrderItemDto)
  items!: JobOrderItemDto[];
}
