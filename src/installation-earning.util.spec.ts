import { computeInstallationEarning, detectLocation } from './installation-earning.util';

const rates = {
  INSIDE_TAGUM: { baseAmount: 500, extraAmount: 150 },
  OUTSIDE_TAGUM: { baseAmount: 900, extraAmount: 250 },
};

describe('detectLocation', () => {
  it('treats an address containing "Tagum" as inside Tagum, ignoring case', () => {
    expect(detectLocation('Purok 3, Apokon, TAGUM City, Davao del Norte')).toBe('INSIDE_TAGUM');
    expect(detectLocation('tagum')).toBe('INSIDE_TAGUM');
  });

  it('treats any other address as outside Tagum', () => {
    expect(detectLocation('Poblacion, Panabo City')).toBe('OUTSIDE_TAGUM');
  });

  it('falls back to inside Tagum when there is no address', () => {
    expect(detectLocation(null)).toBe('INSIDE_TAGUM');
    expect(detectLocation('   ')).toBe('INSIDE_TAGUM');
  });
});

describe('computeInstallationEarning', () => {
  it('pays only the base rate for a single computer', () => {
    const result = computeInstallationEarning({ address: 'Tagum City', licenseCount: 1, rates });
    expect(result.amount).toBe(500);
    expect(result.location).toBe('INSIDE_TAGUM');
    expect(result.computers).toBe(1);
  });

  it('adds the extra rate for each computer after the first', () => {
    const result = computeInstallationEarning({ address: 'Panabo City', licenseCount: 4, rates });
    expect(result.amount).toBe(900 + 3 * 250);
    expect(result.location).toBe('OUTSIDE_TAGUM');
    expect(result.computers).toBe(4);
  });

  it('counts at least one computer when the client has no licenses', () => {
    const result = computeInstallationEarning({ address: 'Tagum City', licenseCount: 0, rates });
    expect(result.computers).toBe(1);
    expect(result.amount).toBe(500);
  });

  it('returns zero when the rates for the location are not configured', () => {
    const result = computeInstallationEarning({
      address: 'Tagum City',
      licenseCount: 3,
      rates: { ...rates, INSIDE_TAGUM: { baseAmount: 0, extraAmount: 0 } },
    });
    expect(result.amount).toBe(0);
  });

  it('explains the computation in the note', () => {
    const result = computeInstallationEarning({ address: 'Tagum City', licenseCount: 3, rates });
    expect(result.note).toBe('Inside Tagum · 3 computers · 500 + 2 × 150');
  });

  it('flags a missing address in the note', () => {
    const result = computeInstallationEarning({ address: null, licenseCount: 1, rates });
    expect(result.note).toBe('Inside Tagum (no address on file) · 1 computer · 500');
  });
});
