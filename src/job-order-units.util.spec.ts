import { BadRequestException } from '@nestjs/common';
import { validateUnits } from './job-order-units.util';

const u = (over = {}) => ({ key: 'a', label: 'Computer 1', ...over });

describe('validateUnits', () => {
  it('rejects duplicate keys', () => {
    expect(() => validateUnits([u(), u()], [])).toThrow(BadRequestException);
  });
  it('rejects an item pointing at an unknown unit', () => {
    expect(() => validateUnits([u()], ['zzz'])).toThrow(BadRequestException);
  });
  it('rejects cloud enabled without months >= 1', () => {
    expect(() => validateUnits([u({ cloudEnabled: true, cloudMonths: 0 })], [])).toThrow(BadRequestException);
  });
  it('accepts valid units and general items', () => {
    expect(() => validateUnits([u()], [undefined, 'a'])).not.toThrow();
  });
});
