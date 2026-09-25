import { BadRequestException } from '@nestjs/common';
import { computeUnitTotals, unitCloudTotal, validateUnits } from './job-order-units.util';

const u = (over = {}) => ({ key: 'a', label: 'Computer 1', price: 1000, ...over });

describe('unitCloudTotal', () => {
  it('is rate x months when enabled', () => {
    expect(unitCloudTotal(u({ cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 3 }))).toBe(1500);
  });
  it('is zero when disabled or missing values', () => {
    expect(unitCloudTotal(u({ cloudEnabled: false, cloudMonthlyRate: 500, cloudMonths: 3 }))).toBe(0);
    expect(unitCloudTotal(u({ cloudEnabled: true }))).toBe(0);
  });
});

describe('computeUnitTotals', () => {
  it('sums unit prices and cloud totals, rounded to cents', () => {
    const totals = computeUnitTotals([
      u({ key: 'a', price: 49000, cloudEnabled: true, cloudMonthlyRate: 999.99, cloudMonths: 1 }),
      u({ key: 'b', price: 30000.5 }),
    ]);
    expect(totals).toEqual({ salePrice: 79000.5, cloudTotal: 999.99 });
  });
});

describe('validateUnits', () => {
  it('rejects duplicate keys', () => {
    expect(() => validateUnits([u(), u()], [])).toThrow(BadRequestException);
  });
  it('rejects an item pointing at an unknown unit', () => {
    expect(() => validateUnits([u()], ['zzz'])).toThrow(BadRequestException);
  });
  it('rejects cloud enabled without months >= 1', () => {
    expect(() => validateUnits([u({ cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 0 })], [])).toThrow(BadRequestException);
  });
  it('accepts valid units and general items', () => {
    expect(() => validateUnits([u()], [undefined, 'a'])).not.toThrow();
  });
});
