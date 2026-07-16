import { FinancialReportsService } from './financial-reports.service';

/** Builds a YYYY-MM key the same way the service formats byMonth entries. */
function monthKey(offsetFromNow: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetFromNow, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fakePayment(over: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    jobOrderId: 'jo-1',
    amount: 1000,
    method: 'CASH',
    paidAt: new Date(),
    voidedAt: null,
    jobOrder: { client: { businessName: 'Verdix' } },
    ...over,
  };
}

describe('FinancialReportsService.collectionsSummary', () => {
  let findMany: jest.Mock;
  let service: FinancialReportsService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    const prisma = { payment: { findMany } } as never;
    service = new FinancialReportsService(prisma);
  });

  it('keeps totalCollected and byMethod aggregation', async () => {
    findMany.mockResolvedValueOnce([
      fakePayment({ id: 'a', amount: 5000, method: 'CASH' }),
      fakePayment({ id: 'b', amount: 4000, method: 'GCASH' }),
      fakePayment({ id: 'c', amount: 1000, method: 'CASH' }),
    ]);

    const summary = await service.collectionsSummary();
    expect(summary.totalCollected).toBe(10000);
    expect(summary.byMethod).toEqual(
      expect.arrayContaining([
        { method: 'CASH', total: 6000, count: 2 },
        { method: 'GCASH', total: 4000, count: 1 },
      ]),
    );
  });

  it('returns 6 zero-filled months oldest-first in byMonth', async () => {
    const summary = await service.collectionsSummary();
    expect(summary.byMonth).toHaveLength(6);
    expect(summary.byMonth.map((m) => m.month)).toEqual(
      [-5, -4, -3, -2, -1, 0].map(monthKey),
    );
    expect(summary.byMonth.every((m) => m.total === 0)).toBe(true);
  });

  it('groups trend payments into their calendar month', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    findMany
      .mockResolvedValueOnce([]) // filtered range query
      .mockResolvedValueOnce([
        { paidAt: now, amount: 3000 },
        { paidAt: now, amount: 2000 },
        { paidAt: lastMonth, amount: 1500 },
      ]);

    const summary = await service.collectionsSummary();
    const byKey = Object.fromEntries(summary.byMonth.map((m) => [m.month, m.total]));
    expect(byKey[monthKey(0)]).toBe(5000);
    expect(byKey[monthKey(-1)]).toBe(1500);
  });

  it('exposes the 10 newest filtered payments with client names', async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      fakePayment({
        id: `pay-${i}`,
        amount: 100 + i,
        paidAt: new Date(Date.now() - i * 86400000),
        jobOrder: { client: { businessName: `Client ${i}` } },
      }),
    );
    findMany.mockResolvedValueOnce(rows);

    const summary = await service.collectionsSummary();
    expect(summary.recentPayments).toHaveLength(10);
    expect(summary.recentPayments[0]).toEqual({
      id: 'pay-0',
      jobOrderId: 'jo-1',
      amount: 100,
      method: 'CASH',
      paidAt: rows[0].paidAt.toISOString(),
      clientName: 'Client 0',
    });
  });

  it('asks the trend query for the last 6 months regardless of the filter', async () => {
    await service.collectionsSummary('2026-01-01', '2026-01-31');
    expect(findMany).toHaveBeenCalledTimes(2);
    const trendArgs = findMany.mock.calls[1][0];
    const now = new Date();
    expect(trendArgs.where.voidedAt).toBeNull();
    expect(trendArgs.where.paidAt.gte).toEqual(
      new Date(now.getFullYear(), now.getMonth() - 5, 1),
    );
  });
});
