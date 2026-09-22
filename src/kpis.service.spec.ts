import { KpisService } from './kpis.service';

const dashboard = (totalScore: number) => ({
  kpis: [],
  totalScore,
  baseBonus: 975,
  incentiveEstimate: 0,
  incentiveStatus: null,
  incentiveAmount: null,
});

describe('KpisService.getTeam', () => {
  function setup() {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', fullName: 'Rex Domingo', role: 'DEVELOPER', baseBonus: 975 },
          { id: 'u2', fullName: 'Ronald Rodulfa', role: 'INSTALLER', baseBonus: 1000 },
        ]),
      },
    };
    const withdrawals = {
      computeAvailableBalances: jest.fn().mockResolvedValue(new Map([['u1', 1050]])),
    };
    const service = new KpisService(prisma as never, {} as never, withdrawals as never);
    jest
      .spyOn(service, 'getDashboard')
      .mockImplementation(async (userId: string) => dashboard(userId === 'u1' ? 34 : 0));
    return { prisma, withdrawals, service };
  }

  it("adds each member's available balance", async () => {
    const { withdrawals, service } = setup();

    const team = await service.getTeam(9, 2026);

    expect(withdrawals.computeAvailableBalances).toHaveBeenCalledWith(['u1', 'u2']);
    expect(team.find((m) => m.userId === 'u1')?.availableBalance).toBe(1050);
  });

  it('reports a zero balance for members without one', async () => {
    const { service } = setup();
    const team = await service.getTeam(9, 2026);
    expect(team.find((m) => m.userId === 'u2')?.availableBalance).toBe(0);
  });
});

describe('KpisService.installerAutoKpis', () => {
  // Incentives are split across the whole roster, so KPI credit follows the
  // same rule: a helper installer is credited for jobs they worked, not only
  // the primary installer.
  const rosterFilter = (userId: string) => ({
    OR: [
      { installers: { some: { userId } } },
      { installerId: userId, installers: { none: {} } },
    ],
  });

  function setup() {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { job: { count } };
    const service = new KpisService(prisma as never, {} as never, {} as never);
    return { count, service };
  }

  it('credits every installer on the roster, with a fallback for legacy jobs', async () => {
    const { count, service } = setup();
    const start = new Date(2026, 8, 1);
    const end = new Date(2026, 9, 1);

    await (service as unknown as {
      installerAutoKpis(userId: string, start: Date, end: Date): Promise<Record<string, number>>;
    }).installerAutoKpis('helper-1', start, end);

    // Every query in the function scopes by the roster filter, not installerId.
    expect(count).toHaveBeenCalledTimes(4);
    for (const call of count.mock.calls) {
      expect(call[0].where).toMatchObject(rosterFilter('helper-1'));
      expect(call[0].where.scheduleDate).toEqual({ gte: start, lt: end });
      expect(call[0].where.installerId).toBeUndefined();
    }
  });

  it('computes the rates from the roster-scoped counts', async () => {
    const { count, service } = setup();
    // total, completed, withProof, completedOrLater
    count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);

    const kpis = await (service as unknown as {
      installerAutoKpis(userId: string, start: Date, end: Date): Promise<Record<string, number>>;
    }).installerAutoKpis('helper-1', new Date(2026, 8, 1), new Date(2026, 9, 1));

    expect(kpis['Installation Completion Rate']).toBe(75);
    expect(kpis['Proof Submission Rate']).toBe(50);
    expect(kpis['Monthly Activity']).toBe(40);
  });
});
