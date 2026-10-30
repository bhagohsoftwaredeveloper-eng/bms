import type { JobOrderUnit } from './types';

/** Local (unsaved) state for one computer on a SOFTWARE job order. */
export interface UnitDraft {
  _key: string;
  label: string;
  productId: string;
  cloudEnabled: boolean;
  cloudMonths: number;
}

export const GENERAL_KEY = '__general__';
export const MAX_PREFILL_COMPUTERS = 20;

let unitSeq = 0;
const newUnitKey = () => `unit-${++unitSeq}`;

export function blankUnit(index: number): UnitDraft {
  return {
    _key: newUnitKey(),
    label: `Computer ${index + 1}`,
    productId: '',
    cloudEnabled: false,
    cloudMonths: 1,
  };
}

export function unitsForCount(count: number): UnitDraft[] {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, MAX_PREFILL_COMPUTERS));
  return Array.from({ length: n }, (_, i) => blankUnit(i));
}

export function fromSavedUnits(saved: JobOrderUnit[]): UnitDraft[] {
  return [...saved]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((u) => ({
      _key: u.id,
      label: u.label,
      productId: u.productId ?? '',
      cloudEnabled: u.cloudEnabled,
      cloudMonths: u.cloudMonths ?? 1,
    }));
}

/** An order saved before computers existed renders as a single implicit computer. */
export function legacyUnit(productId: string): UnitDraft {
  return { ...blankUnit(0), productId };
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
