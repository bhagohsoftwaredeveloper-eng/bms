import { BadRequestException } from '@nestjs/common';
import { ensureLaborEarning } from './job-order-labor.util';

function fakeTx(existingEarning: unknown = null) {
  return {
    earning: {
      findFirst: jest.fn().mockResolvedValue(existingEarning),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

const baseCctv = {
  type: 'CCTV' as const,
  status: 'FINALIZED' as const,
  laborAmount: 4000,
  jobId: 'job-1',
  job: { installerId: 'installer-1' },
};

describe('ensureLaborEarning', () => {
  it('creates a PENDING INSTALLATION earning for a finalized CCTV order', async () => {
    const tx = fakeTx();
    await ensureLaborEarning(tx, baseCctv);
    expect(tx.earning.create).toHaveBeenCalledWith({
      data: { userId: 'installer-1', jobId: 'job-1', amount: 4000, type: 'INSTALLATION' },
    });
  });

  it('uses the labor amount for signage orders too', async () => {
    const tx = fakeTx();
    await ensureLaborEarning(tx, { ...baseCctv, type: 'SIGNAGE', laborAmount: 7000 });
    expect(tx.earning.create).toHaveBeenCalledWith({
      data: { userId: 'installer-1', jobId: 'job-1', amount: 7000, type: 'INSTALLATION' },
    });
  });

  it('does nothing for SOFTWARE orders', async () => {
    const tx = fakeTx();
    await ensureLaborEarning(tx, { ...baseCctv, type: 'SOFTWARE' });
    expect(tx.earning.findFirst).not.toHaveBeenCalled();
    expect(tx.earning.create).not.toHaveBeenCalled();
  });

  it('does nothing for DRAFT or CANCELLED orders', async () => {
    for (const status of ['DRAFT', 'CANCELLED'] as const) {
      const tx = fakeTx();
      await ensureLaborEarning(tx, { ...baseCctv, status });
      expect(tx.earning.create).not.toHaveBeenCalled();
    }
  });

  it('is idempotent — skips creation when an INSTALLATION earning exists for the job', async () => {
    const tx = fakeTx({ id: 'earning-1' });
    await ensureLaborEarning(tx, baseCctv);
    expect(tx.earning.findFirst).toHaveBeenCalledWith({
      where: { jobId: 'job-1', type: 'INSTALLATION' },
    });
    expect(tx.earning.create).not.toHaveBeenCalled();
  });

  it('rejects finalize when the job has no installer', async () => {
    const tx = fakeTx();
    await expect(
      ensureLaborEarning(tx, { ...baseCctv, job: { installerId: null } }),
    ).rejects.toThrow('Assign an installer to the job before finalizing.');
    await expect(
      ensureLaborEarning(tx, { ...baseCctv, jobId: null, job: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects finalize when no labor amount is entered', async () => {
    const tx = fakeTx();
    for (const laborAmount of [null, 0]) {
      await expect(ensureLaborEarning(tx, { ...baseCctv, laborAmount })).rejects.toThrow(
        'Enter the installer labor amount before finalizing.',
      );
    }
  });

  it('also ensures the earning for ON_GOING and COMPLETED statuses', async () => {
    for (const status of ['ON_GOING', 'COMPLETED'] as const) {
      const tx = fakeTx();
      await ensureLaborEarning(tx, { ...baseCctv, status });
      expect(tx.earning.create).toHaveBeenCalled();
    }
  });
});
