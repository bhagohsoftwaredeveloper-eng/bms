import { IsEnum, IsString, MinLength } from 'class-validator';

export enum PrinterMachineModelDto {
  TS100_1600_SUBLIMATION = 'TS100_1600_SUBLIMATION',
  JV100_160 = 'JV100_160',
  UCJV300_160 = 'UCJV300_160',
}

export class CreateMachineDto {
  @IsEnum(PrinterMachineModelDto)
  model: PrinterMachineModelDto;

  @IsString()
  @MinLength(1)
  label: string;
}
