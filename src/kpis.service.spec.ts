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
