import { EarningsService } from './earnings.service';

function makePrisma(overrides: {
  job?: unknown;
  existingEarning?: unknown;
  licenseCount?: number;
  rates?: Array<{ location: string; baseAmount: number; extraAmount: number }>;
  installers?: Array<{ userId: string }>;
} = {}) {
  const job = 'job' in overrides
    ? overrides.job
    : { id: 'job-1', clientId: 'client-1', installerId: 'installer-1', client: { address: 'Tagum City' }, jobOrder: null };
  return {
    job: { findUnique: jest.fn().mockResolvedValue(job) },
    earning: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingEarning ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    jobInstaller: { findMany: jest.fn().mockResolvedValue(overrides.installers ?? []) },
    license: { count: jest.fn().mockResolvedValue(overrides.licenseCount ?? 1) },
    installationRate: {
      findMany: jest.fn().mockResolvedValue(
        overrides.rates ?? [
          { location: 'INSIDE_TAGUM', baseAmount: 500, extraAmount: 150 },
          { location: 'OUTSIDE_TAGUM', baseAmount: 900, extraAmount: 250 },
        ],
      ),
    },
  };
}

describe('EarningsService.ensureInstallationEarning', () => {
  it('creates a PENDING INSTALLATION earning from the client address and license count', async () => {
    const prisma = makePrisma({ licenseCount: 3 });
    const service = new EarningsService(prisma as never);

    await service.ensureInstallationEarning('job-1');

    expect(prisma.license.count).toHaveBeenCalledWith({ where: { clientId: 'client-1', voidedAt: null } });
    expect(prisma.earning.create).toHaveBeenCalledWith({
      data: {
        userId: 'installer-1',
        jobId: 'job-1',
        amount: 800,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 3 computers · 500 + 2 × 150',
      },
    });
  });

  it('uses the outside-Tagum rate for addresses elsewhere', async () => {
    const prisma = makePrisma({
      job: { id: 'job-1', clientId: 'c', installerId: 'i', client: { address: 'Panabo City' }, jobOrder: null },
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');
    expect(prisma.earning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 900 }) }),
    );
  });

  it('does nothing when an installation earning already exists for the job', async () => {
    const prisma = makePrisma({ existingEarning: { id: 'e1' } });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it('does nothing when the job has no installer', async () => {
    const prisma = makePrisma({
      job: { id: 'job-1', clientId: 'c', installerId: null, client: { address: 'Tagum' }, jobOrder: null },
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it('skips CCTV and signage jobs, which earn labor from their job order', async () => {
    const prisma = makePrisma({
      job: { id: 'job-1', clientId: 'c', installerId: 'i', client: { address: 'Tagum' }, jobOrder: { type: 'CCTV' } },
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it('does nothing when the rates are not configured yet', async () => {
    const prisma = makePrisma({
      rates: [
        { location: 'INSIDE_TAGUM', baseAmount: 0, extraAmount: 0 },
        { location: 'OUTSIDE_TAGUM', baseAmount: 0, extraAmount: 0 },
      ],
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it('splits the earning equally when two installers are assigned', async () => {
    const prisma = makePrisma({
      licenseCount: 1,
      installers: [{ userId: 'installer-1' }, { userId: 'installer-2' }],
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');

    expect(prisma.earning.create).toHaveBeenCalledTimes(2);
    expect(prisma.earning.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'installer-1',
        jobId: 'job-1',
        amount: 250,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500 · Split 2 ways: ₱250.00 each',
      },
    });
    expect(prisma.earning.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'installer-2',
        jobId: 'job-1',
        amount: 250,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500 · Split 2 ways: ₱250.00 each',
      },
    });
  });

  it('falls back to the legacy single-earner behavior when there are no JobInstaller rows', async () => {
    const prisma = makePrisma({ licenseCount: 1, installers: [] });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');

    expect(prisma.earning.create).toHaveBeenCalledTimes(1);
    expect(prisma.earning.create).toHaveBeenCalledWith({
      data: {
        userId: 'installer-1',
        jobId: 'job-1',
        amount: 500,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500',
      },
    });
  });
});
