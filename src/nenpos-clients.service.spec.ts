import { BadRequestException } from '@nestjs/common';
import { NenposClientsService } from './nenpos-clients.service';

type Existing = { id: string; clientId: string; license: string | null };

function buildService(existing: Existing[] = []) {
  const prisma = {
    nenposClient: {
      findMany: jest.fn().mockResolvedValue(existing),
      update: jest.fn((args) => ({ op: 'update', args })),
      createMany: jest.fn((args) => ({ op: 'createMany', args })),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new NenposClientsService(prisma as never, {} as never);
  return { service, prisma };
}

const HEADER = 'Client ID,Client Name,Start Date,Expiry Date,License,Status,Installer,Notes,Address,Owner,Contact No,Record ID';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\r\n'), 'utf8');

describe('NenposClientsService.uploadExcel', () => {
  it('fills in an existing record when the row has a Record ID, clearing the expiry once a key is added', async () => {
    const { service, prisma } = buildService([{ id: 'rec-1', clientId: 'CLT-1', license: null }]);

    const result = await service.uploadExcel(
      csv('CLT-1,Shop One,2025-10-16,2025-11-14,2567878001,ACTIVE,PITS,,Cebu,Owner,0917,rec-1'),
    );

    expect(result).toEqual({ imported: 0, updated: 1 });
    expect(prisma.nenposClient.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: expect.objectContaining({ license: '2567878001', expiryDate: null, isTrial: false, clientId: 'CLT-1' }),
    });
    expect(prisma.nenposClient.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('keeps the expiry when the record already had a key', async () => {
    const { service, prisma } = buildService([{ id: 'rec-1', clientId: 'CLT-1', license: 'OLD-KEY' }]);

    await service.uploadExcel(csv('CLT-1,Shop One,2025-01-01,2026-01-01,NEW-KEY,ACTIVE,,,,,,rec-1'));

    const { data } = prisma.nenposClient.update.mock.calls[0][0];
    expect(data.license).toBe('NEW-KEY');
    expect(data.expiryDate).toEqual(new Date('2026-01-01'));
    expect(data).not.toHaveProperty('isTrial');
  });

  it('keeps the existing client ID when the cell is blank', async () => {
    const { service, prisma } = buildService([{ id: 'rec-1', clientId: 'CLT-1', license: null }]);

    await service.uploadExcel(csv(',Shop One,,,KEY-1,,,,,,,rec-1'));

    expect(prisma.nenposClient.update.mock.calls[0][0].data.clientId).toBe('CLT-1');
  });

  it('still creates rows without a Record ID', async () => {
    const { service, prisma } = buildService();

    const result = await service.uploadExcel(csv('CLT-9,New Shop,,,KEY-9,,,,,,,'));

    expect(result).toEqual({ imported: 1, updated: 0 });
    expect(prisma.nenposClient.findMany).not.toHaveBeenCalled();
    expect(prisma.nenposClient.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ clientId: 'CLT-9', clientName: 'New Shop', license: 'KEY-9' })],
    });
  });

  it('rejects the whole file when a Record ID is unknown or voided', async () => {
    const { service, prisma } = buildService([]);

    await expect(service.uploadExcel(csv('CLT-1,Shop One,,,KEY-1,,,,,,,missing-id'))).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
