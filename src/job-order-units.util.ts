import { BadRequestException } from '@nestjs/common';

export interface UnitInput {
  key: string;
  label: string;
  productId?: string;
  cloudEnabled?: boolean;
  cloudMonths?: number;
}

export function validateUnits(units: UnitInput[], itemUnitKeys: (string | undefined)[]): void {
  const keys = new Set<string>();
  for (const u of units) {
    if (keys.has(u.key)) throw new BadRequestException(`Duplicate computer key "${u.key}"`);
    keys.add(u.key);
    if (u.cloudEnabled && (!Number.isInteger(u.cloudMonths) || (u.cloudMonths ?? 0) < 1)) {
      throw new BadRequestException(`"${u.label}": cloud subscription needs at least 1 month`);
    }
  }
  for (const k of itemUnitKeys) {
    if (k !== undefined && !keys.has(k)) {
      throw new BadRequestException(`Item refers to unknown computer "${k}"`);
    }
  }
}
