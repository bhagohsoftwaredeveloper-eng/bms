import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import type { UpsertJobOrderDto } from './upsert-job-order.dto';

const user = { id: 'admin-1' } as never;

function buildTx() {
  return {
    jobOrderItem: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    jobOrderUnit: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `unit-${data.sortOrder}`, ...data })),
    },
    jobOrder: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id, job: null, items: [], units: [] })),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, jobId: null, job: null, items: [], ...stripNested(data) }),
      ),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'jo-created', job: null, items: [], ...stripNested(data) }),
      ),
    },
    agreementVersion: { findFirst: jest.fn() },
    job: {
      create: jest.fn().mockResolvedValue({ id: 'job-created' }),
    },
    jobInstaller: { create: jest.fn().mockResolvedValue({}) },
    earning: { findFirst: jest.fn(), create: jest.fn() },
  };
}

function stripNested(data: Record<string, unknown>) {
  const { items: _items, ...rest } = data;
  return rest;
}

function buildService(tx: ReturnType<typeof buildTx>) {
  const prisma = {
    jobOrder: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    agreementVersion: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const inventory = { applyJobOrderStock: jest.fn() };
  const service = new JobOrdersService(prisma as never, inventory as never);
  return { service, prisma, inventory };
}

const baseDto: UpsertJobOrderDto = {
  clientId: 'client-1',
  salePrice: 10000,
  items: [],
};

describe('JobOrdersService.upsert', () => {
  it('resolves the existing order by id when dto.id is given', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', status: 'DRAFT' });

    await service.upsert({ ...baseDto, id: 'jo-1' }, user);

    expect(prisma.jobOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'jo-1' } });
    expect(tx.jobOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'jo-1' } }),
    );
    expect(tx.jobOrder.create).not.toHaveBeenCalled();
  });

  it('throws 404 when dto.id matches nothing instead of creating a duplicate', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.upsert({ ...baseDto, id: 'missing' }, user)).rejects.toThrow(NotFoundException);
    expect(tx.jobOrder.create).not.toHaveBeenCalled();
  });

  it('creates a standalone order when neither id nor jobId is given', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);

    await service.upsert(baseDto, user);

    expect(prisma.jobOrder.findUnique).not.toHaveBeenCalled();
    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobId: undefined }) }),
    );
  });

  it('persists includeAgreement when the dto sets it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, includeAgreement: true }, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: true }) }),
    );
  });

  it('defaults includeAgreement to false when the dto omits it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(baseDto, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: false }) }),
    );
  });

  it('persists the warranty tier on each item', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      {
        ...baseDto,
        items: [
          { name: 'System Unit', quantity: 1, unitPrice: 20000, warrantyTier: 'MAIN_SET' },
          { name: 'Cash Drawer', quantity: 1, unitPrice: 3000, warrantyTier: 'ACCESSORY' },
        ],
      },
      user,
    );

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created.map((i: { warrantyTier: string }) => i.warrantyTier)).toEqual(['MAIN_SET', 'ACCESSORY']);
  });

  it('defaults an item warranty tier to ACCESSORY when omitted', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, items: [{ name: 'Cash Drawer', quantity: 1, unitPrice: 3000 }] }, user);

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created[0].warrantyTier).toBe('ACCESSORY');
  });
});

describe('JobOrdersService.convert', () => {
  it('creates an installation job for the order client and links it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: null, clientId: 'client-1' });

    await service.convert('jo-1', { scheduleDate: '2026-08-01', installerId: 'inst-1' });

    expect(tx.job.create).toHaveBeenCalledWith({
      data: {
        clientId: 'client-1',
        scheduleDate: new Date('2026-08-01'),
        installerId: 'inst-1',
      },
    });
    // The roster row must be written too, or the job is invisible to its
    // installer in GET /jobs and the admin edit form silently unassigns it.
    expect(tx.jobInstaller.create).toHaveBeenCalledWith({
      data: { jobId: 'job-created', userId: 'inst-1' },
    });
    expect(tx.jobOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jo-1' },
        data: expect.objectContaining({ jobId: 'job-created', docType: 'JOB_ORDER' }),
      }),
    );
  });

  it('defaults installerId to null when omitted', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: null, clientId: 'client-1' });

    await service.convert('jo-1', { scheduleDate: '2026-08-01' });

    expect(tx.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ installerId: null }),
    });
    expect(tx.jobInstaller.create).not.toHaveBeenCalled();
  });

  it('rejects an order that is already linked to a job', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: 'job-9', clientId: 'client-1' });

    await expect(service.convert('jo-1', { scheduleDate: '2026-08-01' })).rejects.toThrow(BadRequestException);
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.convert('nope', { scheduleDate: '2026-08-01' })).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService.pinAgreement', () => {
  it('pins an unpinned order to the latest version', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: 'v3' },
    });
    expect(result).toEqual({ agreementVersionId: 'v3' });
  });

  it('leaves an already-pinned order alone', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: 'v1' });
  });

  it('is a no-op when no template version exists', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue(null);

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.pinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService.unpinAgreement', () => {
  it('clears the pin', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });

    const result = await service.unpinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: null },
    });
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.unpinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService include shapes', () => {
  it('findAll does not request the agreement version, since it backs the list page', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);

    await service.findAll();

    expect(prisma.jobOrder.findMany).toHaveBeenCalledTimes(1);
    const include = prisma.jobOrder.findMany.mock.calls[0][0].include;
    expect(include.agreementVersion).toBeUndefined();
  });

  it('findOne requests the agreement version with sections ordered by sortOrder asc', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1' });

    await service.findOne('jo-1');

    const include = prisma.jobOrder.findUnique.mock.calls[0][0].include;
    expect(include.agreementVersion).toEqual({
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('findByJob requests the agreement version with sections ordered by sortOrder asc', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1' });

    await service.findByJob('job-1');

    const include = prisma.jobOrder.findUnique.mock.calls[0][0].include;
    expect(include.agreementVersion).toEqual({
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });
});

describe('JobOrdersService.upsert with computers', () => {
  const units = [
    { key: 'k1', label: 'Front', productId: 'p1', price: 49000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 2 },
    { key: 'k2', label: 'Back', productId: 'p2', price: 30000 },
  ];

  it('recomputes salePrice/cloudTotal from units and ignores the client salePrice', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, salePrice: 1, units }, user);

    const data = tx.jobOrder.create.mock.calls[0][0].data;
    expect(data.salePrice).toBe(79000);
    expect(data.cloudTotal).toBe(1000);
    expect(data.productId).toBe('p1');
  });

  it('creates units in order and links tagged items to the new unit ids', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      {
        ...baseDto,
        units,
        items: [
          { name: 'Printer', quantity: 1, unitPrice: 100, unitKey: 'k2' },
          { name: 'Router', quantity: 1, unitPrice: 50 },
        ],
      },
      user,
    );

    expect(tx.jobOrderUnit.create).toHaveBeenCalledTimes(2);
    const general = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(general.map((i: { name: string }) => i.name)).toEqual(['Router']);
    expect(tx.jobOrderItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ name: 'Printer', unitId: 'unit-1' })],
    });
  });

  it('deletes old units when re-saving an existing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', status: 'DRAFT' });

    await service.upsert({ ...baseDto, id: 'jo-1', units }, user);

    expect(tx.jobOrderUnit.deleteMany).toHaveBeenCalledWith({ where: { jobOrderId: 'jo-1' } });
  });

  it('rejects an item whose unitKey matches no unit', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await expect(
      service.upsert({ ...baseDto, units, items: [{ name: 'X', quantity: 1, unitPrice: 1, unitKey: 'nope' }] }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps the legacy path when no units are sent', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, salePrice: 10000 }, user);

    const data = tx.jobOrder.create.mock.calls[0][0].data;
    expect(data.salePrice).toBe(10000);
    expect(data.cloudTotal).toBe(0);
    expect(tx.jobOrderUnit.create).not.toHaveBeenCalled();
  });

  it('ignores units on CCTV orders', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, type: 'CCTV', units }, user);

    expect(tx.jobOrderUnit.create).not.toHaveBeenCalled();
    expect(tx.jobOrder.create.mock.calls[0][0].data.salePrice).toBe(10000);
  });

  it('keeps a unit-tagged item as a general item when units are ignored (CCTV order)', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      { ...baseDto, type: 'CCTV', units, items: [{ name: 'Cable', quantity: 1, unitPrice: 10, unitKey: 'k1' }] },
      user,
    );

    const general = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(general).toHaveLength(1);
    expect(general[0].name).toBe('Cable');
    expect(general[0].unitId).toBeUndefined();
    expect(tx.jobOrderItem.createMany).not.toHaveBeenCalled();
  });
});
