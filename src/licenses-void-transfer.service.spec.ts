import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LicensesService } from './licenses.service';
import { NenposClientsService } from './nenpos-clients.service';
import { VoidTransferActionDto } from './void-transfer-action.dto';

function buildDeps(opts: {
  license?: Record<string, unknown> | null;
  nenposRecord?: Record<string, unknown> | null;
}) {
  const created: Record<string, unknown>[] = [];
  const txCalls: string[] = [];

  const prisma = {
    license: {
      findUnique: jest.fn().mockResolvedValue(opts.license ?? null),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
    nenposClient: {
      findUnique: jest.fn().mockResolvedValue(opts.nenposRecord ?? null),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve({ id: 'npc-new', ...data });
      }),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        nenposClient: { create: prisma.nenposClient.create },
        license: { update: prisma.license.update },
      }),
    ),
  };

  const auth = { verifyPassword: jest.fn().mockResolvedValue(undefined) } as unknown as AuthService;
  const crypto = {} as never;

  const licensesService = new LicensesService(prisma as never, crypto, auth);
  const nenposService = new NenposClientsService(prisma as never, auth);
  return { prisma, auth, licensesService, nenposService, created, txCalls };
}

function dto(overrides: Partial<VoidTransferActionDto> = {}): VoidTransferActionDto {
  return { password: 'secret', confirmName: 'Gavs Store', ...overrides };
}

const ACTIVE_LICENSE = {
  id: 'lic-1',
  licenseKey: 'KEY-123',
  status: 'ACTIVATED',
  activationDate: new Date('2026-01-01'),
  expirationDate: new Date('2027-01-01'),
  voidedAt: null,
  client: { id: 'c-1', businessName: 'Gavs Store', clientCode: 'CLT-1', address: 'Cebu' },
  product: { id: 'p-1', productName: 'NENPOS' },
};

describe('LicensesService.void', () => {
  it('rejects a wrong confirmation name and changes nothing', async () => {
    const { prisma, licensesService } = buildDeps({ license: ACTIVE_LICENSE });

    await expect(licensesService.void('lic-1', 'u-1', dto({ confirmName: 'Wrong Name' }))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it('rejects an already-voided license', async () => {
    const { prisma, licensesService } = buildDeps({
      license: { ...ACTIVE_LICENSE, voidedAt: new Date() },
    });

    await expect(licensesService.void('lic-1', 'u-1', dto())).rejects.toThrow('already voided');
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it('rejects a bad password before touching anything', async () => {
    const { prisma, auth, licensesService } = buildDeps({ license: ACTIVE_LICENSE });
    (auth.verifyPassword as jest.Mock).mockRejectedValue(new UnauthorizedException());

    await expect(licensesService.void('lic-1', 'u-1', dto())).rejects.toThrow(UnauthorizedException);
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it('voids with audit fields on success', async () => {
    const { prisma, licensesService } = buildDeps({ license: ACTIVE_LICENSE });

    await licensesService.void('lic-1', 'u-1', dto({ reason: 'wrong entry' }));

    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({
          voidedAt: expect.any(Date),
          voidedById: 'u-1',
          voidReason: 'wrong entry',
        }),
      }),
    );
  });
});

describe('LicensesService.transferToNenpos', () => {
  it('creates the NENPOS row and voids the license in one transaction', async () => {
    const { prisma, licensesService } = buildDeps({ license: ACTIVE_LICENSE });

    const result = await licensesService.transferToNenpos('lic-1', 'u-1', dto());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.nenposClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientName: 'Gavs Store',
          clientId: 'CLT-1',
          license: 'KEY-123',
          status: 'ACTIVE',
          address: 'Cebu',
        }),
      }),
    );
    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({
          transferredToNenposClientId: 'npc-new',
          voidedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.nenposClient.id).toBe('npc-new');
  });

  it('maps EXPIRED license status to EXPIRED in the NENPOS row', async () => {
    const { prisma, licensesService } = buildDeps({
      license: { ...ACTIVE_LICENSE, status: 'EXPIRED' },
    });

    await licensesService.transferToNenpos('lic-1', 'u-1', dto());

    expect(prisma.nenposClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it('refuses a name mismatch without creating anything', async () => {
    const { prisma, licensesService } = buildDeps({ license: ACTIVE_LICENSE });

    await expect(licensesService.transferToNenpos('lic-1', 'u-1', dto({ confirmName: 'Nope' }))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.nenposClient.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('NenposClientsService.void', () => {
  const RECORD = {
    id: 'npc-1',
    clientName: 'Gavs Store',
    voidedAt: null,
    transferredToLicenseId: null,
  };

  it('voids with the transfer link when provided', async () => {
    const { prisma, nenposService } = buildDeps({ nenposRecord: RECORD });

    await nenposService.void('npc-1', 'u-1', dto({ transferredToLicenseId: 'lic-new' }));

    expect(prisma.nenposClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'npc-1' },
        data: expect.objectContaining({
          voidedAt: expect.any(Date),
          transferredToLicenseId: 'lic-new',
        }),
      }),
    );
  });

  it('rejects an already-voided record', async () => {
    const { prisma, nenposService } = buildDeps({
      nenposRecord: { ...RECORD, voidedAt: new Date() },
    });

    await expect(nenposService.void('npc-1', 'u-1', dto())).rejects.toThrow('already voided');
    expect(prisma.nenposClient.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong confirmation name', async () => {
    const { prisma, nenposService } = buildDeps({ nenposRecord: RECORD });

    await expect(nenposService.void('npc-1', 'u-1', dto({ confirmName: 'Different' }))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.nenposClient.update).not.toHaveBeenCalled();
  });
});
