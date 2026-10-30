import { computeLaborIncentive } from './job-order-pricing.util';

describe('computeLaborIncentive', () => {
  it('is the admin-entered labor amount for CCTV and Signage', () => {
    expect(computeLaborIncentive('CCTV', 4000)).toBe(4000);
    expect(computeLaborIncentive('SIGNAGE', 7000.5)).toBe(7000.5);
  });
  it('is zero for SOFTWARE regardless of the amount', () => {
    expect(computeLaborIncentive('SOFTWARE', 5000)).toBe(0);
  });
  it('is zero when no amount is entered', () => {
    expect(computeLaborIncentive('CCTV', null)).toBe(0);
    expect(computeLaborIncentive('SIGNAGE', undefined)).toBe(0);
  });
});
