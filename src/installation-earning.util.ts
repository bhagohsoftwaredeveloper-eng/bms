export type TagumLocation = 'INSIDE_TAGUM' | 'OUTSIDE_TAGUM';

export interface InstallationRate {
  baseAmount: number;
  extraAmount: number;
}

export type InstallationRates = Record<TagumLocation, InstallationRate>;

export interface InstallationEarningResult {
  amount: number;
  location: TagumLocation;
  computers: number;
  note: string;
}

const LOCATION_LABEL: Record<TagumLocation, string> = {
  INSIDE_TAGUM: 'Inside Tagum',
  OUTSIDE_TAGUM: 'Outside Tagum',
};

/** A blank address falls back to inside Tagum (the lower-risk assumption). */
export function detectLocation(address: string | null | undefined): TagumLocation {
  const text = (address ?? '').trim().toLowerCase();
  if (!text) return 'INSIDE_TAGUM';
  return text.includes('tagum') ? 'INSIDE_TAGUM' : 'OUTSIDE_TAGUM';
}

export function computeInstallationEarning(input: {
  address: string | null | undefined;
  licenseCount: number;
  rates: InstallationRates;
}): InstallationEarningResult {
  const location = detectLocation(input.address);
  const computers = Math.max(input.licenseCount, 1);
  const { baseAmount, extraAmount } = input.rates[location];
  const extraComputers = computers - 1;
  const amount = baseAmount + extraComputers * extraAmount;

  const noAddress = !(input.address ?? '').trim();
  const formula = extraComputers > 0 ? `${baseAmount} + ${extraComputers} × ${extraAmount}` : `${baseAmount}`;
  const note = `${LOCATION_LABEL[location]}${noAddress ? ' (no address on file)' : ''} · ${computers} computer${computers !== 1 ? 's' : ''} · ${formula}`;

  return { amount: amount > 0 ? amount : 0, location, computers, note };
}
