import { describe, expect, it } from 'vitest';
import {
  applyProduct, blankUnit, computeTotals, detachItems, fromSavedUnits, groupItems,
  legacyUnit, sumUnits, unitCloudTotal, unitsForCount,
} from './job-order-units';
import type { SoftwareProduct } from './types';

const product = { id: 'p1', productName: 'NenPos', version: '3.0', licenseType: 'SUBSCRIPTION_MONTHLY', price: '49000', maintenanceFee: '500' } as SoftwareProduct;

describe('unitsForCount', () => {
  it('creates N blank labelled computers, at least 1 and at most 20', () => {
    expect(unitsForCount(2).map((u) => u.label)).toEqual(['Computer 1', 'Computer 2']);
    expect(unitsForCount(0)).toHaveLength(1);
    expect(unitsForCount(500)).toHaveLength(20);
  });
  it('gives each unit a distinct key', () => {
    const keys = unitsForCount(3).map((u) => u._key);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('applyProduct', () => {
  it('fills product, price and cloud rate from the product', () => {
    const u = applyProduct(blankUnit(0), product);
    expect(u).toMatchObject({ productId: 'p1', price: 49000, cloudMonthlyRate: 500 });
  });
  it('clears the product when none is given', () => {
    const u = applyProduct({ ...blankUnit(0), productId: 'p1', price: 5 }, undefined);
    expect(u.productId).toBe('');
  });
});

describe('sumUnits / unitCloudTotal', () => {
  it('sums systems and cloud (rate x months) for enabled units only', () => {
    const a = { ...blankUnit(0), price: 1000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 3 };
    const b = { ...blankUnit(1), price: 2000, cloudEnabled: false, cloudMonthlyRate: 500, cloudMonths: 3 };
    expect(unitCloudTotal(a)).toBe(1500);
    expect(sumUnits([a, b])).toEqual({ systemsTotal: 3000, cloudTotal: 1500 });
  });
});

describe('computeTotals', () => {
  it('adds cloud to the subtotal and applies the discount to it', () => {
    const t = computeTotals(10000, 10, 'PERCENTAGE', [{ quantity: 1, unitPrice: 1000 }], 1000);
    expect(t).toEqual({ materialsTotal: 1000, subtotal: 12000, discountAmt: 1200, grandTotal: 10800 });
  });
  it('defaults cloud to 0 and never goes negative', () => {
    expect(computeTotals(100, 500, 'FIXED', []).grandTotal).toBe(0);
  });
});

describe('fromSavedUnits / legacyUnit', () => {
  it('uses the saved id as the draft key so items can be re-linked', () => {
    const [u] = fromSavedUnits([
      { id: 'srv-1', jobOrderId: 'jo', label: 'Front', sortOrder: 0, productId: 'p1', price: '49000', cloudEnabled: true, cloudMonthlyRate: '500', cloudMonths: 2 },
    ]);
    expect(u).toMatchObject({ _key: 'srv-1', label: 'Front', price: 49000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 2 });
  });
  it('wraps an order without units in one implicit computer', () => {
    expect(legacyUnit('p1', 49000)).toMatchObject({ label: 'Computer 1', productId: 'p1', price: 49000, cloudEnabled: false });
  });
});

describe('groupItems / detachItems', () => {
  const [a, b] = unitsForCount(2);
  const items = [
    { name: 'x', unitKey: a._key },
    { name: 'y', unitKey: b._key },
    { name: 'z' },
    { name: 'orphan', unitKey: 'gone' },
  ];
  it('groups per computer and puts unlinked/orphaned items under General', () => {
    const groups = groupItems(items, [a, b]);
    expect(groups.map((g) => g.items.map((i) => i.name))).toEqual([['x'], ['y'], ['z', 'orphan']]);
    expect(groups[2].unit).toBeNull();
  });
  it('omits General when it is empty', () => {
    expect(groupItems([{ name: 'x', unitKey: a._key }], [a, b])).toHaveLength(2);
  });
  it('detaches the items of a removed computer to General', () => {
    expect(detachItems(items, a._key)[0].unitKey).toBeUndefined();
  });
});
