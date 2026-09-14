import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ItemPackagesService } from './item-packages.service';

function buildPrisma() {
  const prisma = {
    itemPackage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'pkg-1', name: 'Package 1' }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pkg-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'pkg-1' }),
    },
    inventoryItem: {
      count: jest.fn().mockResolvedValue(2),
    },
  };
  return { prisma, service: new ItemPackagesService(prisma as never) };
}

describe('ItemPackagesService.list', () => {
  it('returns only active packages ordered by sortOrder then name', async () => {
    const { prisma, service } = buildPrisma();

    await service.list();

    expect(prisma.itemPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('includes inactive packages when asked', async () => {
    const { prisma, service } = buildPrisma();

    await service.list(true);

    expect(prisma.itemPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});

describe('ItemPackagesService.create', () => {
  it('creates the package with one component row per item', async () => {
    const { prisma, service } = buildPrisma();

    await service.create({
      name: 'Package 1',
      items: [
        { inventoryItemId: 'inv-a', quantity: 1 },
        { inventoryItemId: 'inv-b', quantity: 2 },
      ],
    });

    expect(prisma.inventoryItem.count).toHaveBeenCalledWith({
      where: { id: { in: ['inv-a', 'inv-b'] } },
    });
    expect(prisma.itemPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Package 1',
          items: {
            create: [
              expect.objectContaining({ inventoryItemId: 'inv-a', quantity: 1, sortOrder: 0 }),
              expect.objectContaining({ inventoryItemId: 'inv-b', quantity: 2, sortOrder: 1 }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects components pointing at missing inventory items', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(1);

    await expect(
      service.create({
        name: 'Bad package',
        items: [
          { inventoryItemId: 'inv-a', quantity: 1 },
          { inventoryItemId: 'missing', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.itemPackage.create).not.toHaveBeenCalled();
  });
});

describe('ItemPackagesService.update', () => {
  it('replaces the component list wholesale when items are provided', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(1);

    await service.update('pkg-1', {
      items: [{ inventoryItemId: 'inv-a', quantity: 3 }],
    });

    expect(prisma.itemPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pkg-1' },
        data: expect.objectContaining({
          items: {
            deleteMany: {},
            create: [expect.objectContaining({ inventoryItemId: 'inv-a', quantity: 3, sortOrder: 0 })],
          },
        }),
      }),
    );
  });

  it('leaves components untouched when only metadata changes', async () => {
    const { prisma, service } = buildPrisma();

    await service.update('pkg-1', { active: false });

    expect(prisma.itemPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ items: expect.anything() }),
      }),
    );
  });
});

describe('ItemPackagesService.remove', () => {
  it('deletes the package', async () => {
    const { prisma, service } = buildPrisma();

    await expect(service.remove('pkg-1')).resolves.toEqual({ id: 'pkg-1' });
    expect(prisma.itemPackage.delete).toHaveBeenCalledWith({ where: { id: 'pkg-1' } });
  });

  it('throws when the package does not exist', async () => {
    const { prisma, service } = buildPrisma();
    prisma.itemPackage.findUnique.mockResolvedValue(null);

    await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
  });
});
