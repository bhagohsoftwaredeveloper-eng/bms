import { JobsService } from './jobs.service';

function makePrisma(overrides: { job?: unknown; validInstallerCount?: number } = {}) {
  const job = 'job' in overrides
    ? overrides.job
    : { id: 'job-1', clientId: 'client-1', installerId: 'old-installer', client: { businessName: 'Acme' } };

  const assigned = { ...(job as Record<string, unknown>), installerId: 'installer-1' };

  // The transaction body runs against this fixed set of tx-scoped mocks, so
  // tests can assert on exactly what setInstallers/create sent inside the
  // transaction.
  const txJobUpdate = jest.fn().mockResolvedValue(assigned);
  const txJobCreate = jest.fn().mockResolvedValue(assigned);
  const txDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const txCreateMany = jest.fn().mockResolvedValue({ count: 0 });

  return {
    job: {
      create: jest.fn().mockResolvedValue(assigned),
      update: jest.fn().mockResolvedValue(assigned),
      findUnique: jest.fn().mockResolvedValue(job),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Role validation: by default every id passed is a real INSTALLER.
    user: {
      count: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(overrides.validInstallerCount ?? where.id.in.length),
      ),
    },
    tx: { jobUpdate: txJobUpdate, jobCreate: txJobCreate, deleteMany: txDeleteMany, createMany: txCreateMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        job: { update: txJobUpdate, create: txJobCreate },
        jobInstaller: { deleteMany: txDeleteMany, createMany: txCreateMany },
      }),
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
      skipDuplicates: true,
    });
    expect(deps.notifications.notify).toHaveBeenCalledTimes(2);
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-1' }),
    );
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-2' }),
    );
  });

  it('checks that every id belongs to a user with the INSTALLER role, as primary or secondary', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.assignInstaller('job-1', { installerIds: ['installer-1', 'installer-2'] });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['installer-1', 'installer-2'] },
        OR: [{ role: 'INSTALLER' }, { additionalRoles: { some: { role: 'INSTALLER' } } }],
      },
    });
  });

  it('accepts an id whose ONLY installer role is a secondary (additional) role', async () => {
    // user.count is mocked, so this locks in the OR-shaped where the service
    // sends — it does not simulate the additionalRoles join itself.
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.assignInstaller('job-1', { installerIds: ['installer-1', 'secondary-role-installer'] });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['installer-1', 'secondary-role-installer'] },
        OR: [{ role: 'INSTALLER' }, { additionalRoles: { some: { role: 'INSTALLER' } } }],
      },
    });
    expect(prisma.tx.jobUpdate).toHaveBeenCalled();
  });

  it('rejects an id that does not belong to an installer, before writing anything', async () => {
    // Only 1 of the 2 ids resolves to a user with the INSTALLER role.
    const prisma = makePrisma({ validInstallerCount: 1 });
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await expect(
      service.assignInstaller('job-1', { installerIds: ['installer-1', 'not-an-installer'] }),
    ).rejects.toThrow('One or more selected installers are invalid.');
    expect(prisma.tx.jobUpdate).not.toHaveBeenCalled();
    expect(prisma.tx.createMany).not.toHaveBeenCalled();
    expect(deps.notifications.notify).not.toHaveBeenCalled();
  });
});

describe('JobsService.create', () => {
  it('sets installerId to the first id and writes a JobInstaller row per id, in one transaction', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.create({
      clientId: 'client-1',
      installerIds: ['a', 'b'],
      scheduleDate: new Date('2026-01-01'),
    } as never);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.tx.jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ installerId: 'a', jobStatus: 'ASSIGNED' }),
      }),
    );
    expect(prisma.tx.createMany).toHaveBeenCalledWith({
      data: [{ jobId: 'job-1', userId: 'a' }, { jobId: 'job-1', userId: 'b' }],
      skipDuplicates: true,
    });
    // The plain (non-tx) client must not be used for either write.
    expect(prisma.job.create).not.toHaveBeenCalled();
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

  it('unassigns everyone when installerIds is empty: installerId null and every roster row deleted', async () => {
    const job = { id: 'job-1', clientId: 'client-1', installerId: 'installer-1', client: { businessName: 'Acme' }, jobStatus: 'ASSIGNED' };
    const prisma = makePrisma({ job });
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.update('job-1', { clientId: 'client-1', installerIds: [], scheduleDate: new Date('2026-01-01') } as never);

    expect(prisma.tx.jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { installerId: null },
    });
    expect(prisma.tx.deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(prisma.tx.createMany).not.toHaveBeenCalled();
    // Nothing to validate, so no role lookup is issued for an empty list.
    expect(prisma.user.count).not.toHaveBeenCalled();
  });
});

describe('JobsService.findAll', () => {
  it('matches jobs where the installer is on the roster OR is a legacy-gap primary installer', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.findAll('user-1', 'INSTALLER');

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { installers: { some: { userId: 'user-1' } } },
            { installerId: 'user-1', installers: { none: {} } },
          ],
        },
      }),
    );
  });

  it('does not scope the query for a non-installer role', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.findAll('user-1', 'ADMIN');

    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('JobsService.assertOwnedByInstaller (via submitProof)', () => {
  function makeProofPrisma(installers: { userId: string }[]) {
    const job = {
      id: 'job-1',
      clientId: 'client-1',
      installerId: installers[0]?.userId ?? null,
      client: { businessName: 'Acme' },
      installers,
      jobStatus: 'ON_GOING',
    };
    return {
      job: {
        findUnique: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockResolvedValue(job),
      },
      installationProof: { upsert: jest.fn().mockResolvedValue({}) },
    };
  }

  it('allows a non-primary assigned installer to submit proof', async () => {
    const prisma = makeProofPrisma([{ userId: 'lead-1' }, { userId: 'helper-1' }]);
    const earnings = { ensureInstallationEarning: jest.fn().mockResolvedValue(null) };
    const service = new JobsService(prisma as never, { notify: jest.fn() } as never, earnings as never);

    await expect(
      service.submitProof('job-1', 'helper-1', { photoUrls: ['a.jpg'] } as never),
    ).resolves.toBeDefined();
  });

  it('rejects an installer who is not assigned to the job', async () => {
    const prisma = makeProofPrisma([{ userId: 'lead-1' }]);
    const earnings = { ensureInstallationEarning: jest.fn().mockResolvedValue(null) };
    const service = new JobsService(prisma as never, { notify: jest.fn() } as never, earnings as never);

    await expect(
      service.submitProof('job-1', 'stranger-1', { photoUrls: ['a.jpg'] } as never),
    ).rejects.toThrow('You are not assigned to this job');
  });

  it('falls back to installerId match for a legacy job with an empty installers array', async () => {
    // findOne() always includes `installers`, so a legacy job (no JobInstaller
    // rows yet) has installers: [] rather than undefined — the fallback must
    // still work in that case, not just when installers is literally undefined.
    const job = {
      id: 'job-1',
      clientId: 'client-1',
      installerId: 'legacy-installer-1',
      client: { businessName: 'Acme' },
      installers: [],
      jobStatus: 'ON_GOING',
    };
    const prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockResolvedValue(job),
      },
      installationProof: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const earnings = { ensureInstallationEarning: jest.fn().mockResolvedValue(null) };
    const service = new JobsService(prisma as never, { notify: jest.fn() } as never, earnings as never);

    await expect(
      service.submitProof('job-1', 'legacy-installer-1', { photoUrls: ['a.jpg'] } as never),
    ).resolves.toBeDefined();
  });
});
