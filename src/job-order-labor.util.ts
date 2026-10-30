import { BadRequestException } from '@nestjs/common';
import { computeLaborIncentive } from './job-order-pricing.util';

const LABOR_STATUSES = ['FINALIZED', 'ON_GOING', 'COMPLETED'];

/** Minimal slice of a Prisma transaction client this util needs (kept narrow for testability). */
export interface LaborEarningTx {
  earning: {
    findFirst(args: { where: { jobId: string; type: 'INSTALLATION' } }): Promise<unknown>;
    create(args: {
      data: { userId: string; jobId: string; amount: number; type: 'INSTALLATION' };
    }): Promise<unknown>;
  };
}

export interface LaborJobOrder {
  type: 'SOFTWARE' | 'CCTV' | 'SIGNAGE';
  status: string;
  laborAmount: unknown;
  jobId: string | null;
  job: { installerId: string | null } | null;
}

/**
 * When a CCTV/Signage job order is finalized (or beyond), guarantee exactly one
 * PENDING INSTALLATION earning exists for the job's installer. Runs inside the
 * upsert transaction so a validation failure rolls the whole save back.
 */
export async function ensureLaborEarning(tx: LaborEarningTx, jobOrder: LaborJobOrder): Promise<void> {
  if (jobOrder.type === 'SOFTWARE') return;
  if (!LABOR_STATUSES.includes(jobOrder.status)) return;

  const installerId = jobOrder.job?.installerId;
  if (!jobOrder.jobId || !installerId) {
    throw new BadRequestException('Assign an installer to the job before finalizing.');
  }

  const labor = computeLaborIncentive(
    jobOrder.type,
    jobOrder.laborAmount === null || jobOrder.laborAmount === undefined ? null : Number(jobOrder.laborAmount),
  );
  if (labor <= 0) {
    throw new BadRequestException('Enter the installer labor amount before finalizing.');
  }

  const existing = await tx.earning.findFirst({
    where: { jobId: jobOrder.jobId, type: 'INSTALLATION' },
  });
  if (existing) return;

  await tx.earning.create({
    data: { userId: installerId, jobId: jobOrder.jobId, amount: labor, type: 'INSTALLATION' },
  });
}
