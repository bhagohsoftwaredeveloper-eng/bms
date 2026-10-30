import { describe, expect, it } from 'vitest';
import { detachItems, fromSavedUnits, groupItems, legacyUnit, unitsForCount } from './job-order-units';

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

describe('fromSavedUnits / legacyUnit', () => {
  it('uses the saved id as the draft key so items can be re-linked', () => {
    const [u] = fromSavedUnits([
      { id: 'srv-1', jobOrderId: 'jo', label: 'Front', sortOrder: 0, productId: 'p1', cloudEnabled: true, cloudMonths: 2 },
    ]);
    expect(u).toMatchObject({ _key: 'srv-1', label: 'Front', cloudEnabled: true, cloudMonths: 2 });
  });
  it('wraps an order without units in one implicit computer', () => {
    expect(legacyUnit('p1')).toMatchObject({ label: 'Computer 1', productId: 'p1', cloudEnabled: false });
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
