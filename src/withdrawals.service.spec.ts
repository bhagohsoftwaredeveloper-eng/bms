import { WithdrawalsService } from './withdrawals.service';

function makeService(earned: Array<{ userId: string; amount: number }>, withdrawn: Array<{ userId: string; amount: number }>) {
  const prisma = {
    earning: {
      groupBy: jest.fn().mockResolvedValue(earned.map((e) => ({ userId: e.userId, _sum: { amount: e.amount } }))),
    },
    withdrawal: {
      groupBy: jest.fn().mockResolvedValue(withdrawn.map((w) => ({ userId: w.userId, _sum: { amount: w.amount } }))),
    },
  };
  return { prisma, service: new WithdrawalsService(prisma as never, {} as never) };
}

describe('WithdrawalsService.computeAvailableBalances', () => {
  it('returns approved+paid earnings minus pending/approved/released withdrawals per user', async () => {
    const { prisma, service } = makeService(
      [{ userId: 'u1', amount: 2250 }, { userId: 'u2', amount: 500 }],
      [{ userId: 'u1', amount: 1200 }],
    );

    const balances = await service.computeAvailableBalances(['u1', 'u2', 'u3']);

    expect(prisma.earning.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { userId: { in: ['u1', 'u2', 'u3'] }, status: { in: ['APPROVED', 'PAID'] } },
      _sum: { amount: true },
    });
    expect(prisma.withdrawal.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { userId: { in: ['u1', 'u2', 'u3'] }, status: { in: ['PENDING', 'APPROVED', 'RELEASED'] } },
      _sum: { amount: true },
    });
    expect(balances.get('u1')).toBe(1050);
    expect(balances.get('u2')).toBe(500);
    expect(balances.get('u3')).toBe(0);
  });

  it('never goes below zero', async () => {
    const { service } = makeService([{ userId: 'u1', amount: 100 }], [{ userId: 'u1', amount: 300 }]);
    expect((await service.computeAvailableBalances(['u1'])).get('u1')).toBe(0);
  });

  it('computeAvailableBalance returns the single-user figure', async () => {
    const { service } = makeService([{ userId: 'u1', amount: 2250 }], [{ userId: 'u1', amount: 1200 }]);
    expect(await service.computeAvailableBalance('u1')).toBe(1050);
  });
});
