import type { JobOrderUnit, SoftwareProduct } from './types';

/** Local (unsaved) state for one computer on a SOFTWARE job order. */
export interface UnitDraft {
  _key: string;
  label: string;
  productId: string;
  price: number;
  cloudEnabled: boolean;
  cloudMonthlyRate: number;
  cloudMonths: number;
}

export const GENERAL_KEY = '__general__';
export const MAX_PREFILL_COMPUTERS = 20;

let unitSeq = 0;
const newUnitKey = () => `unit-${++unitSeq}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function blankUnit(index: number): UnitDraft {
  return {
    _key: newUnitKey(),
    label: `Computer ${index + 1}`,
    productId: '',
    price: 0,
    cloudEnabled: false,
    cloudMonthlyRate: 0,
    cloudMonths: 1,
  };
}

export function unitsForCount(count: number): UnitDraft[] {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, MAX_PREFILL_COMPUTERS));
  return Array.from({ length: n }, (_, i) => blankUnit(i));
}

/** Picks a product for a computer: price and cloud rate follow the product, both stay editable. */
export function applyProduct(unit: UnitDraft, product?: SoftwareProduct): UnitDraft {
  if (!product) return { ...unit, productId: '' };
  return {
    ...unit,
    productId: product.id,
    price: Number(product.price),
    cloudMonthlyRate: product.maintenanceFee != null ? Number(product.maintenanceFee) : unit.cloudMonthlyRate,
  };
}

export function unitCloudTotal(u: UnitDraft): number {
  return u.cloudEnabled ? round2(u.cloudMonthlyRate * u.cloudMonths) : 0;
}

export function sumUnits(units: UnitDraft[]): { systemsTotal: number; cloudTotal: number } {
  return {
    systemsTotal: round2(units.reduce((s, u) => s + u.price, 0)),
    cloudTotal: round2(units.reduce((s, u) => s + unitCloudTotal(u), 0)),
  };
}

export function fromSavedUnits(saved: JobOrderUnit[]): UnitDraft[] {
  return [...saved]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((u) => ({
      _key: u.id,
      label: u.label,
      productId: u.productId ?? '',
      price: Number(u.price),
      cloudEnabled: u.cloudEnabled,
      cloudMonthlyRate: u.cloudMonthlyRate != null ? Number(u.cloudMonthlyRate) : 0,
      cloudMonths: u.cloudMonths ?? 1,
    }));
}

/** An order saved before computers existed renders as a single implicit computer. */
export function legacyUnit(productId: string, salePrice: number): UnitDraft {
  return { ...blankUnit(0), productId, price: salePrice };
}

/** Mirrors the backend computeGrandTotal (src/job-order-pricing.util.ts) exactly. */
export function computeTotals(
  salePrice: number,
  discount: number,
  discountType: 'FIXED' | 'PERCENTAGE',
  items: { quantity: number; unitPrice: number }[],
  cloudTotal = 0,
) {
  const materialsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const subtotal = salePrice + materialsTotal + cloudTotal;
  const discountAmt = discountType === 'PERCENTAGE' ? (subtotal * discount) / 100 : discount;
  const grandTotal = Math.max(0, subtotal - discountAmt);
  return { materialsTotal, subtotal, discountAmt, grandTotal };
}

/** One group per computer (in order), then General for unlinked/orphaned items when non-empty. */
export function groupItems<T extends { unitKey?: string | null }>(
  items: T[],
  units: UnitDraft[],
): { key: string; unit: UnitDraft | null; items: T[] }[] {
  const known = new Set(units.map((u) => u._key));
  const groups = units.map((unit) => ({ key: unit._key, unit, items: items.filter((i) => i.unitKey === unit._key) }));
  const general = items.filter((i) => !i.unitKey || !known.has(i.unitKey));
  return general.length ? [...groups, { key: GENERAL_KEY, unit: null, items: general }] : groups;
}

/** When a computer is removed its items fall back to General rather than being deleted. */
export function detachItems<T extends { unitKey?: string | null }>(items: T[], unitKey: string): T[] {
  return items.map((i) => (i.unitKey === unitKey ? { ...i, unitKey: undefined } : i));
}
