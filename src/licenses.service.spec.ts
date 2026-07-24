import { BadRequestException } from '@nestjs/common';
import { LicensesService } from './licenses.service';

function buildService() {
  const prisma = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    softwareProduct: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    license: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'lic-1', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const crypto = { signLicenseToken: jest.fn().mockReturnValue('signed-token') };
  const service = new LicensesService(prisma as never, crypto as never);
  return { service, prisma, crypto };
}

describe('LicensesService.generate (trial)', () => {
  it('auto-generates a unique TRIAL- key and defaults trialDays to 30', async () => {
    const { service } = buildService();
    const result = await service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true } as never);
    expect(result.licenseKey).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.trialDays).toBe(30);
    expect(result.isTrial).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.expirationDate).toBeNull();
  });

  it('honors an explicit trialDays value', async () => {
    const { service } = buildService();
    const result = await service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true, trialDays: 14 } as never);
    expect(result.trialDays).toBe(14);
  });

  it('rejects a non-trial license with no key', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
