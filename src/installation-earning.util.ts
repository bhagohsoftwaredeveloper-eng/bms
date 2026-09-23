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
  /** SOFTWARE-only flat bonus for setting up the POS backoffice extension. */
  backofficeExtension?: { included: boolean; amount: number };
}): InstallationEarningResult {
  const location = detectLocation(input.address);
  const computers = Math.max(input.licenseCount, 1);
  const { baseAmount, extraAmount } = input.rates[location];
  const extraComputers = computers - 1;
  const backofficeAmount =
    input.backofficeExtension?.included && input.backofficeExtension.amount > 0
      ? input.backofficeExtension.amount
      : 0;
  const amount = baseAmount + extraComputers * extraAmount + backofficeAmount;

  const noAddress = !(input.address ?? '').trim();
  const formula = extraComputers > 0 ? `${baseAmount} + ${extraComputers} × ${extraAmount}` : `${baseAmount}`;
  const backofficeNote = backofficeAmount > 0 ? ` + ₱${backofficeAmount} backoffice extension` : '';
  const note = `${LOCATION_LABEL[location]}${noAddress ? ' (no address on file)' : ''} · ${computers} computer${computers !== 1 ? 's' : ''} · ${formula}${backofficeNote}`;

  return { amount: amount > 0 ? amount : 0, location, computers, note };
}

/**
 * Splits a total installation earning equally between everyone who worked
 * the job. Straight division, rounded to the nearest centavo per installer —
 * the sum of shares may be off from `total` by a cent or two, which is
 * accepted rather than corrected onto any one installer.
 */
export function splitInstallationEarning(total: number, installerCount: number): number[] {
  const count = Math.max(installerCount, 1);
  const share = Math.round((total / count) * 100) / 100;
  return Array(count).fill(share);
}
