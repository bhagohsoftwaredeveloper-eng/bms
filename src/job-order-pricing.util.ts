/**
 * Installer labor incentive for CCTV / Signage jobs: the fixed amount the admin enters on the
 * job order. Internal cost only. Software orders earn nothing here.
 */
export function computeLaborIncentive(
  type: 'SOFTWARE' | 'CCTV' | 'SIGNAGE',
  laborAmount: number | null | undefined,
): number {
  if (type === 'SOFTWARE') return 0;
  return Math.max(0, laborAmount ?? 0);
}
