import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EarningStatus, Withdrawal, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { CreateWithdrawalDto } from './create-withdrawal.dto';

/**
 * Which current statuses may move to a given target status. REJECTED is also
 * reachable from APPROVED so a mistaken approval can be undone before release;
 * RELEASED is final.
 */
const ALLOWED_FROM: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  [WithdrawalStatus.PENDING]: [],
  [WithdrawalStatus.APPROVED]: [WithdrawalStatus.PENDING],
  [WithdrawalStatus.REJECTED]: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED],
  [WithdrawalStatus.RELEASED]: [WithdrawalStatus.APPROVED],
};

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Available balance = sum(APPROVED + PAID earnings)
   *                   - sum(PENDING + APPROVED + RELEASED withdrawals)
   *
   * Earnings stay in the "earned" pool whether they're APPROVED or have since
   * been flagged PAID for bookkeeping — only withdrawals remove money from the
   * pool. RELEASED withdrawals are permanent deductions (money already paid
   * out), while PENDING/APPROVED withdrawals are reservations against future
   * payout. Earnings are never split or re-flagged when a withdrawal moves
   * through these states, so this single formula stays accurate at every stage.
   */
  async computeAvailableBalance(userId: string): Promise<number> {
    const [earnedTotal, deductedWithdrawals] = await Promise.all([
      this.prisma.earning.aggregate({
        where: { userId, status: { in: [EarningStatus.APPROVED, EarningStatus.PAID] } },
        _sum: { amount: true },
      }),
      this.prisma.withdrawal.aggregate({
        where: {
          userId,
          status: {
            in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED, WithdrawalStatus.RELEASED],
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const earned = Number(earnedTotal._sum.amount ?? 0);
    const deducted = Number(deductedWithdrawals._sum.amount ?? 0);
    return Math.max(0, earned - deducted);
  }

  async create(userId: string, dto: CreateWithdrawalDto) {
    const available = await this.computeAvailableBalance(userId);
    if (dto.amount > available) {
      throw new BadRequestException(
        `Insufficient balance. Available: ₱${available.toLocaleString()}, requested: ₱${dto.amount.toLocaleString()}.`,
      );
    }
    return this.prisma.withdrawal.create({ data: { ...dto, userId } });
  }

  findAll(userId?: string) {
    return this.prisma.withdrawal.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async setStatus(id: string, status: WithdrawalStatus, actorId: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal ${id} not found`);
    }
    this.assertCanProcess(withdrawal, status, actorId);

    const updated = await this.prisma.withdrawal.update({
      where: { id },
      data: { status },
    });
    await this.notifyStatus(updated.userId, id, status, Number(updated.amount));
    return updated;
  }

  async release(id: string, actorId: string, proofUrl?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal ${id} not found`);
    }
    this.assertCanProcess(withdrawal, WithdrawalStatus.RELEASED, actorId);

    const updated = await this.prisma.withdrawal.update({
      where: { id },
      data: { status: WithdrawalStatus.RELEASED, proofUrl: proofUrl ?? null },
      include: { user: true },
    });
    await this.notifyStatus(updated.userId, id, WithdrawalStatus.RELEASED, Number(updated.amount));
    return updated;
  }

  private assertCanProcess(withdrawal: Withdrawal, target: WithdrawalStatus, actorId: string) {
    if (withdrawal.userId === actorId) {
      throw new ForbiddenException('You cannot process your own withdrawal request.');
    }
    if (!ALLOWED_FROM[target].includes(withdrawal.status)) {
      throw new BadRequestException(
        `Cannot mark a ${withdrawal.status.toLowerCase()} withdrawal as ${target.toLowerCase()}.`,
      );
    }
  }

  private notifyStatus(
    userId: string,
    withdrawalId: string,
    status: WithdrawalStatus,
    amount: number,
  ) {
    const labels: Record<WithdrawalStatus, string> = {
      PENDING: 'is pending review',
      APPROVED: 'has been approved',
      REJECTED: 'was rejected',
      RELEASED: 'has been released',
    };
    const peso = `₱${amount.toLocaleString()}`;
    return this.notifications.notify({
      userId,
      title: `Withdrawal ${status.toLowerCase()}`,
      body: `Your ${peso} withdrawal ${labels[status]}.`,
      eventType: 'withdrawal_status',
      data: { withdrawalId, status, route: '/withdrawals' },
    });
  }
}
