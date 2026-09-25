import { BadRequestException } from '@nestjs/common';

export interface UnitInput {
  key: string;
  label: string;
  productId?: string;
  price: number;
  cloudEnabled?: boolean;
  cloudMonthlyRate?: number;
  cloudMonths?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly cloud rate × months for one computer; zero unless the subscription is enabled. */
export function unitCloudTotal(u: UnitInput): number {
  if (!u.cloudEnabled) return 0;
  return round2((u.cloudMonthlyRate ?? 0) * (u.cloudMonths ?? 0));
}

/** Server-side source of truth for a SOFTWARE order's system price and cloud total. */
export function computeUnitTotals(units: UnitInput[]): { salePrice: number; cloudTotal: number } {
  return {
    salePrice: round2(units.reduce((s, u) => s + u.price, 0)),
    cloudTotal: round2(units.reduce((s, u) => s + unitCloudTotal(u), 0)),
  };
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
