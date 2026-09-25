import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiscountType, DocType, JobOrderStatus, JobOrderType, WarrantyTier } from '@prisma/client';

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

  /** Which Section I warranty list this line appears under on the printed agreement. */
  @IsOptional()
  @IsEnum(WarrantyTier)
  warrantyTier?: WarrantyTier;

  /** Which computer (JobOrderUnitDto.key in the same request) this line belongs to; omit for a general item. */
  @IsOptional()
  @IsString()
  unitKey?: string;
}

export class JobOrderUnitDto {
  /** Client-side id used only to link items to this computer within one request. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  label!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  cloudEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cloudMonthlyRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cloudMonths?: number;
}

export class UpsertJobOrderDto {
  /** Targets an existing order directly — required to re-save standalone orders (no jobId). */
  @IsOptional()
  @IsString()
  id?: string;

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

  @IsOptional()
  @IsEnum(JobOrderType)
  type?: JobOrderType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cameraCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cameraRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  laborPct?: number;

  @IsOptional()
  @IsEnum(DocType)
  docType?: DocType;

  /** Appends the Service Level Agreement pages when the order is printed. */
  @IsOptional()
  @IsBoolean()
  includeAgreement?: boolean;

  /** SOFTWARE orders only: whether this install includes setting up the POS backoffice extension. */
  @IsOptional()
  @IsBoolean()
  includesBackofficeExtension?: boolean;

  /** SOFTWARE orders only: one entry per computer. When present the server recomputes salePrice and cloudTotal. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => JobOrderUnitDto)
  units?: JobOrderUnitDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobOrderItemDto)
  items!: JobOrderItemDto[];
}

/** Turns a standalone quotation into a job order by creating its installation job. */
export class ConvertJobOrderDto {
  @IsDateString()
  scheduleDate!: string;

  @IsOptional()
  @IsString()
  installerId?: string;
}
