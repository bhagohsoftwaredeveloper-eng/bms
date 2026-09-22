import { JobsService } from './jobs.service';

function makePrisma(overrides: { job?: unknown } = {}) {
  const job = 'job' in overrides
    ? overrides.job
    : { id: 'job-1', clientId: 'client-1', installerId: 'old-installer', client: { businessName: 'Acme' } };

  // The transaction body runs against this fixed set of tx-scoped mocks, so
  // tests can assert on exactly what setInstallers sent inside the transaction.
  const txJobUpdate = jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' });
  const txDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const txCreateMany = jest.fn().mockResolvedValue({ count: 0 });

  return {
    job: {
      create: jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' }),
      update: jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' }),
      findUnique: jest.fn().mockResolvedValue(job),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tx: { jobUpdate: txJobUpdate, deleteMany: txDeleteMany, createMany: txCreateMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ job: { update: txJobUpdate }, jobInstaller: { deleteMany: txDeleteMany, createMany: txCreateMany } }),
    ),
  };
}

function makeDeps() {
  return {
    notifications: { notify: jest.fn().mockResolvedValue(undefined) },
    earnings: {},
  };
}

describe('JobsService.assignInstaller', () => {
  it('sets the primary installerId to the first id, flips jobStatus to ASSIGNED, and writes a JobInstaller row per id', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.assignInstaller('job-1', { installerIds: ['installer-1', 'installer-2'] });

    expect(prisma.tx.jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { installerId: 'installer-1', jobStatus: 'ASSIGNED' },
    });
    expect(prisma.tx.deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(prisma.tx.createMany).toHaveBeenCalledWith({
      data: [{ jobId: 'job-1', userId: 'installer-1' }, { jobId: 'job-1', userId: 'installer-2' }],
    });
    expect(deps.notifications.notify).toHaveBeenCalledTimes(2);
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-1' }),
    );
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-2' }),
    );
  });
});

describe('JobsService.update', () => {
  it('syncs the installer list without forcing jobStatus back to ASSIGNED', async () => {
    const job = { id: 'job-1', clientId: 'client-1', installerId: 'installer-1', client: { businessName: 'Acme' }, jobStatus: 'COMPLETED' };
    const prisma = makePrisma({ job });
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.update('job-1', { clientId: 'client-1', installerIds: ['installer-1'], scheduleDate: new Date('2026-01-01'), remarks: 'done' });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { clientId: 'client-1', scheduleDate: new Date('2026-01-01'), remarks: 'done' },
    });
    // setInstallers ran inside the transaction, and must NOT include jobStatus.
    expect(prisma.tx.jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { installerId: 'installer-1' },
    });
  });
});
