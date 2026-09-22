# Multi-Installer Job Assignment + Equal-Split Incentives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a job be assigned to two or three installers at once, and split its computed installation incentive equally between them.

**Architecture:** A new `JobInstaller` join table (`job_installers`) becomes the source of truth for "everyone assigned to this job." `Job.installerId` stays as the primary/lead installer (used for notifications and as a legacy fallback). `EarningsService.ensureInstallationEarning` reads the join table and, when it has 2+ rows, creates one `Earning` per installer with an equal (straight-division, penny-rounded) share of the total; with 0 rows it falls back to today's single-earner behavior unchanged.

**Tech Stack:** NestJS + Prisma (MySQL) backend, React + TanStack Query admin-web, Expo/React Native mobile app, Jest for tests.

## Global Constraints

- The local database has migrations applied that are not yet in this repo (see project memory `db-drift-sdlmp`) — **never** run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`. Migrations in this plan are hand-written SQL files added under `prisma/migrations/`, additive only (matches the existing convention already used by every migration under `prisma/migrations/`).
- Follow the existing MySQL migration style: backtick-quoted identifiers, `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` on new tables, `UUID()` for generated ids in backfill `INSERT`s, `NOW(3)` for timestamps.
- Straight equal division is the approved split rule: `round2(total / count)` per installer; the sum of shares may be off from the original total by a cent or two and that is accepted, not corrected (per the design spec).
- Do not touch CCTV/signage job earnings — `ensureInstallationEarning` already skips non-`SOFTWARE` job orders and this plan does not change that check.

---

### Task 1: `JobInstaller` schema + migration

**Files:**
- Modify: `prisma/schema.prisma:180-186` (User relations block)
- Modify: `prisma/schema.prisma:306-326` (Job model)
- Create: `prisma/migrations/20260922010000_job_installers/migration.sql`

**Interfaces:**
- Produces: Prisma model `JobInstaller { id, jobId, userId, createdAt, job: Job, user: User }`, accessible in code as `this.prisma.jobInstaller` (create/createMany/findMany/deleteMany). `Job.installers: JobInstaller[]` and `User.jobAssignments: JobInstaller[]` become includable relations.

- [ ] **Step 1: Add the `JobInstaller` model and relations to `prisma/schema.prisma`**

In the `User` model, add the new relation right after the existing `installerJobs` line (`prisma/schema.prisma:181`):

```prisma
  installerJobs     Job[]                @relation("InstallerJobs")
  jobAssignments    JobInstaller[]
```

In the `Job` model, add the new relation next to the existing `earnings`/`jobOrder` relations (`prisma/schema.prisma:322-323`):

```prisma
  earnings  Earning[]
  jobOrder  JobOrder?
  installers JobInstaller[]
```

Add the new model directly after the `Job` model closes (`prisma/schema.prisma:326`, right before the `InstallationProof` model comment):

```prisma
// Every installer assigned to a job (includes the primary Job.installerId).
// Used to split the installation incentive equally when more than one
// installer worked the job.
model JobInstaller {
  id        String   @id @default(uuid())
  jobId     String   @map("job_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  job  Job  @relation(fields: [jobId], references: [id])
  user User @relation(fields: [userId], references: [id])

  @@unique([jobId, userId])
  @@map("job_installers")
}
```

- [ ] **Step 2: Verify the schema is valid**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Regenerate the Prisma client so `this.prisma.jobInstaller` and the new relations type-check**

Run: `npx prisma generate`
Expected: completes with `Generated Prisma Client ...` and no errors.

- [ ] **Step 4: Write the migration SQL by hand**

Create `prisma/migrations/20260922010000_job_installers/migration.sql`:

```sql
-- Every installer assigned to a job (includes the primary jobs.installer_id).
-- Lets the installation incentive be split equally when 2+ installers work
-- the same job. Additive only — see project notes on DB drift.

-- CreateTable
CREATE TABLE `job_installers` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `job_installers_job_id_user_id_key`(`job_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_installers` ADD CONSTRAINT `job_installers_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_installers` ADD CONSTRAINT `job_installers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing job that already has a primary installer gets one
-- job_installers row for that installer, so legacy jobs keep working exactly
-- as before (a "team of one" produces no split).
INSERT INTO `job_installers` (`id`, `job_id`, `user_id`, `created_at`)
SELECT UUID(), `id`, `installer_id`, NOW(3)
FROM `jobs`
WHERE `installer_id` IS NOT NULL;
```

- [ ] **Step 5: Apply the migration to the local dev database**

Run: `npx prisma migrate deploy`
Expected: `Applying migration \`20260922010000_job_installers\`` then `All migrations have been successfully applied.`

- [ ] **Step 6: Sanity-check the backfill**

Run (adjust connection flags as needed for this project, e.g. via `npx prisma studio` or a one-off script) — simplest is a throwaway Node check:

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.job.count({where:{installerId:{not:null}}}).then(async jobs=>{const rows=await p.jobInstaller.count();console.log({jobsWithInstaller:jobs,jobInstallerRows:rows});process.exit(0);});"
```

Expected: `jobsWithInstaller` and `jobInstallerRows` are equal (every legacy job with a primary installer now has exactly one `job_installers` row).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260922010000_job_installers
git commit -m "Add JobInstaller join table for multi-installer job assignment"
```

---

### Task 2: `splitInstallationEarning` util (equal split)

**Files:**
- Modify: `src/installation-earning.util.ts`
- Test: `src/installation-earning.util.spec.ts`

**Interfaces:**
- Produces: `export function splitInstallationEarning(total: number, installerCount: number): number[]` — an array of length `Math.max(installerCount, 1)`, each entry `Math.round((total / count) * 100) / 100`, summing to approximately (not necessarily exactly) `total`.

- [ ] **Step 1: Write the failing tests**

Append to `src/installation-earning.util.spec.ts`:

```typescript
import { splitInstallationEarning } from './installation-earning.util';

describe('splitInstallationEarning', () => {
  it('returns the full amount unsplit for a single installer', () => {
    expect(splitInstallationEarning(800, 1)).toEqual([800]);
  });

  it('splits evenly when the total divides cleanly', () => {
    expect(splitInstallationEarning(900, 3)).toEqual([300, 300, 300]);
  });

  it('rounds each share to 2 decimals when the total does not divide cleanly', () => {
    expect(splitInstallationEarning(500, 3)).toEqual([166.67, 166.67, 166.67]);
  });

  it('treats a count of zero the same as one installer', () => {
    expect(splitInstallationEarning(800, 0)).toEqual([800]);
  });
});
```

(Add the `splitInstallationEarning` import to the existing `import { computeInstallationEarning, detectLocation } from './installation-earning.util';` line instead of a separate import statement, so there is only one import line from that module.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/installation-earning.util.spec.ts`
Expected: FAIL — `splitInstallationEarning is not a function` (or import error).

- [ ] **Step 3: Implement `splitInstallationEarning`**

Add to `src/installation-earning.util.ts`, after `computeInstallationEarning`:

```typescript
/**
 * Splits a total installation earning equally between everyone who worked
 * the job. Straight division, rounded to the nearest centavo per installer —
 * the sum of shares may be off from `total` by a cent or two, which is
 * accepted rather than corrected onto any one installer.
 */
export function splitInstallationEarning(total: number, installerCount: number): number[] {
  const count = Math.max(installerCount, 1);
  const share = Math.round((total / count) * 100) / 100;
  return Array(count).fill(share);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/installation-earning.util.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/installation-earning.util.ts src/installation-earning.util.spec.ts
git commit -m "Add splitInstallationEarning for equal-split incentives"
```

---

### Task 3: `EarningsService.ensureInstallationEarning` — split across assigned installers

**Files:**
- Modify: `src/earnings.service.ts:79-105`
- Test: `src/earnings.service.spec.ts`

**Interfaces:**
- Consumes: `splitInstallationEarning(total: number, installerCount: number): number[]` from Task 2; `this.prisma.jobInstaller.findMany({ where: { jobId } })` returning `{ userId: string }[]`.
- Produces: `ensureInstallationEarning(jobId: string)` unchanged signature; now creates 1..N `Earning` rows instead of always exactly 1.

- [ ] **Step 1: Update the spec's Prisma mock and write the failing tests**

In `src/earnings.service.spec.ts`, update `makePrisma` to add a `jobInstaller` mock (default: no rows, i.e. legacy behavior) and switch `earning.create` bookkeeping so multiple calls can be asserted:

```typescript
function makePrisma(overrides: {
  job?: unknown;
  existingEarning?: unknown;
  licenseCount?: number;
  rates?: Array<{ location: string; baseAmount: number; extraAmount: number }>;
  installers?: Array<{ userId: string }>;
} = {}) {
  const job = 'job' in overrides
    ? overrides.job
    : { id: 'job-1', clientId: 'client-1', installerId: 'installer-1', client: { address: 'Tagum City' }, jobOrder: null };
  return {
    job: { findUnique: jest.fn().mockResolvedValue(job) },
    earning: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingEarning ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    jobInstaller: { findMany: jest.fn().mockResolvedValue(overrides.installers ?? []) },
    license: { count: jest.fn().mockResolvedValue(overrides.licenseCount ?? 1) },
    installationRate: {
      findMany: jest.fn().mockResolvedValue(
        overrides.rates ?? [
          { location: 'INSIDE_TAGUM', baseAmount: 500, extraAmount: 150 },
          { location: 'OUTSIDE_TAGUM', baseAmount: 900, extraAmount: 250 },
        ],
      ),
    },
  };
}
```

Add these new test cases at the end of the `describe('EarningsService.ensureInstallationEarning', ...)` block, right before the closing `});`:

```typescript
  it('splits the earning equally when two installers are assigned', async () => {
    const prisma = makePrisma({
      licenseCount: 1,
      installers: [{ userId: 'installer-1' }, { userId: 'installer-2' }],
    });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');

    expect(prisma.earning.create).toHaveBeenCalledTimes(2);
    expect(prisma.earning.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'installer-1',
        jobId: 'job-1',
        amount: 250,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500 · Split 2 ways: ₱250.00 each',
      },
    });
    expect(prisma.earning.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'installer-2',
        jobId: 'job-1',
        amount: 250,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500 · Split 2 ways: ₱250.00 each',
      },
    });
  });

  it('falls back to the legacy single-earner behavior when there are no JobInstaller rows', async () => {
    const prisma = makePrisma({ licenseCount: 1, installers: [] });
    await new EarningsService(prisma as never).ensureInstallationEarning('job-1');

    expect(prisma.earning.create).toHaveBeenCalledTimes(1);
    expect(prisma.earning.create).toHaveBeenCalledWith({
      data: {
        userId: 'installer-1',
        jobId: 'job-1',
        amount: 500,
        type: 'INSTALLATION',
        note: 'Inside Tagum · 1 computer · 500',
      },
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx jest src/earnings.service.spec.ts`
Expected: FAIL on the two new tests — actual amount/note/call-count won't match yet (current code always creates exactly one earning for `job.installerId`, with no split note).

- [ ] **Step 3: Implement the split in `ensureInstallationEarning`**

Replace `src/earnings.service.ts:79-105` (the whole `ensureInstallationEarning` method) with:

```typescript
  /**
   * Creates the PENDING INSTALLATION earning(s) for a job once, priced from the
   * client's address (inside/outside Tagum) and number of licensed computers.
   * When 2+ installers are assigned (via JobInstaller), the total is split
   * equally between them; with none assigned to the join table yet, it falls
   * back to the single `installerId` earner (legacy behavior). CCTV/signage
   * jobs are skipped: their labor earning comes from the job order.
   */
  async ensureInstallationEarning(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { client: { select: { address: true } }, jobOrder: { select: { type: true } } },
    });
    if (!job?.installerId) return null;
    if (job.jobOrder && job.jobOrder.type !== 'SOFTWARE') return null;

    const existing = await this.prisma.earning.findFirst({ where: { jobId, type: 'INSTALLATION' } });
    if (existing) return null;

    const [rates, licenseCount, jobInstallers] = await Promise.all([
      this.getInstallationRates(),
      this.prisma.license.count({ where: { clientId: job.clientId, voidedAt: null } }),
      this.prisma.jobInstaller.findMany({ where: { jobId }, select: { userId: true } }),
    ]);
    const { amount, note } = computeInstallationEarning({ address: job.client.address, licenseCount, rates });
    if (amount <= 0) return null;

    const installerIds = jobInstallers.length > 0 ? jobInstallers.map((row) => row.userId) : [job.installerId];
    const shares = splitInstallationEarning(amount, installerIds.length);
    const noteFor = (share: number) =>
      installerIds.length > 1 ? `${note} · Split ${installerIds.length} ways: ₱${share.toFixed(2)} each` : note;

    const created = await Promise.all(
      installerIds.map((userId, index) =>
        this.prisma.earning.create({
          data: { userId, jobId, amount: shares[index], type: 'INSTALLATION', note: noteFor(shares[index]) },
        }),
      ),
    );
    return created;
  }
```

Update the import line at the top of `src/earnings.service.ts` (`src/earnings.service.ts:10`) to also bring in the new helper:

```typescript
import { computeInstallationEarning, splitInstallationEarning, type InstallationRates, type TagumLocation } from './installation-earning.util';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/earnings.service.spec.ts`
Expected: PASS, all tests green (including the pre-existing ones — note the "creates a PENDING INSTALLATION earning..." test still passes because `installers` defaults to `[]`, taking the legacy single-earner path with `note` unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/earnings.service.ts src/earnings.service.spec.ts
git commit -m "Split installation earning equally across assigned installers"
```

---

### Task 4: Multi-installer assignment — DTOs + `JobsService` write path

**Files:**
- Modify: `src/assign-installer.dto.ts`
- Modify: `src/create-job.dto.ts`
- Modify: `src/update-job.dto.ts`
- Modify: `src/jobs.service.ts:28-98` (`create`, `assignInstaller`, `update`, `notifyAssignment`)
- Test: `src/jobs.service.spec.ts` (new file)

**Interfaces:**
- Produces: `CreateJobDto.installerIds?: string[]`, `UpdateJobDto.installerIds?: string[] | null`, `AssignInstallerDto.installerIds: string[]`. `JobsService.create/update/assignInstaller` all accept these and, as a side effect, replace the job's `JobInstaller` rows and set `Job.installerId` to `installerIds[0]` (or `null`/unchanged when empty/absent).

- [ ] **Step 1: Update the DTOs**

Replace `src/assign-installer.dto.ts` entirely:

```typescript
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AssignInstallerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installerIds!: string[];
}
```

Replace `src/create-job.dto.ts` entirely:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  installerIds?: string[];

  @IsOptional()
  @IsString()
  licenseId?: string;

  @Type(() => Date)
  @IsDate()
  scheduleDate!: Date;

  @IsOptional()
  @IsString()
  remarks?: string;
}
```

Replace `src/update-job.dto.ts` entirely:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class UpdateJobDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  installerIds?: string[] | null;

  @Type(() => Date)
  @IsDate()
  scheduleDate!: Date;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}
```

- [ ] **Step 2: Write the failing tests for `JobsService`**

Create `src/jobs.service.spec.ts`:

```typescript
import { JobsService } from './jobs.service';

function makePrisma(overrides: { job?: unknown } = {}) {
  const job = 'job' in overrides
    ? overrides.job
    : { id: 'job-1', clientId: 'client-1', installerId: 'old-installer', client: { businessName: 'Acme' } };

  // The transaction body runs against this fixed set of tx-scoped mocks, so
  // tests can assert on exactly what setInstallers sent inside the transaction.
  const txJobUpdate = jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' });
  const txDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const txCreateMany = jest.fn().mockResolvedValue({ count: 0 });

  return {
    job: {
      create: jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' }),
      update: jest.fn().mockResolvedValue({ ...job, installerId: 'installer-1' }),
      findUnique: jest.fn().mockResolvedValue(job),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tx: { jobUpdate: txJobUpdate, deleteMany: txDeleteMany, createMany: txCreateMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ job: { update: txJobUpdate }, jobInstaller: { deleteMany: txDeleteMany, createMany: txCreateMany } }),
    ),
  };
}

function makeDeps() {
  return {
    notifications: { notify: jest.fn().mockResolvedValue(undefined) },
    earnings: {},
  };
}

describe('JobsService.assignInstaller', () => {
  it('sets the primary installerId to the first id, flips jobStatus to ASSIGNED, and writes a JobInstaller row per id', async () => {
    const prisma = makePrisma();
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.assignInstaller('job-1', { installerIds: ['installer-1', 'installer-2'] });

    expect(prisma.tx.jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { installerId: 'installer-1', jobStatus: 'ASSIGNED' },
    });
    expect(prisma.tx.deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(prisma.tx.createMany).toHaveBeenCalledWith({
      data: [{ jobId: 'job-1', userId: 'installer-1' }, { jobId: 'job-1', userId: 'installer-2' }],
    });
    expect(deps.notifications.notify).toHaveBeenCalledTimes(2);
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-1' }),
    );
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'installer-2' }),
    );
  });
});

describe('JobsService.update', () => {
  it('syncs the installer list without forcing jobStatus back to ASSIGNED', async () => {
    const job = { id: 'job-1', clientId: 'client-1', installerId: 'installer-1', client: { businessName: 'Acme' }, jobStatus: 'COMPLETED' };
    const prisma = makePrisma({ job });
    const deps = makeDeps();
    const service = new JobsService(prisma as never, deps.notifications as never, deps.earnings as never);

    await service.update('job-1', { clientId: 'client-1', installerIds: ['installer-1'], scheduleDate: new Date('2026-01-01'), remarks: 'done' });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { clientId: 'client-1', scheduleDate: new Date('2026-01-01'), remarks: 'done' },
    });
    // setInstallers ran inside the transaction, and must NOT include jobStatus.
    expect(prisma.tx.jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { installerId: 'installer-1' },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/jobs.service.spec.ts`
Expected: FAIL — `assignInstaller` still expects `dto.installerId` (a single string), so `installerIds` is ignored and `prisma.$transaction`/multiple notifications never happen; `update` still spreads `installerId` directly into the top-level `job.update` call instead of calling `setInstallers` separately.

- [ ] **Step 4: Update `JobsService`**

Replace `src/jobs.service.ts:28-98` (from `async create(dto: CreateJobDto) {` through the end of `notifyAssignment`) with:

```typescript
  async create(dto: CreateJobDto) {
    const installerIds = dto.installerIds ?? [];
    const primaryInstallerId = installerIds[0];
    const job = await this.prisma.job.create({
      data: {
        clientId: dto.clientId,
        installerId: primaryInstallerId,
        licenseId: dto.licenseId,
        scheduleDate: dto.scheduleDate,
        remarks: dto.remarks,
        jobStatus: primaryInstallerId ? JobStatus.ASSIGNED : undefined,
      },
      include: { client: true },
    });
    if (installerIds.length > 0) {
      await this.prisma.jobInstaller.createMany({
        data: installerIds.map((userId) => ({ jobId: job.id, userId })),
      });
      await this.notifyAssignment(job.id, installerIds, job.client.businessName);
    }
    return job;
  }

  findAll(userId?: string, role?: string) {
    const where: Prisma.JobWhereInput = {};
    if (userId) {
      if (role === 'INSTALLER') {
        where.installers = { some: { userId } };
      }
    }

    return this.prisma.job.findMany({
      where,
      orderBy: { scheduleDate: 'desc' },
      include: {
        client: true,
        installer: true,
        license: true,
        proof: true,
        installers: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: true,
        installer: true,
        license: true,
        proof: true,
        jobOrder: true,
        installers: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return job;
  }

  /** Replaces a job's assigned installers: sets the primary installerId to the
   *  first id and rewrites its JobInstaller rows to exactly this list. Only
   *  the explicit "Assign" action should flip the job to ASSIGNED — a plain
   *  edit (e.g. changing remarks) must never move a COMPLETED job backwards. */
  private async setInstallers(jobId: string, installerIds: string[], options: { setAssignedStatus?: boolean } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id: jobId },
        data: {
          installerId: installerIds[0] ?? null,
          ...(options.setAssignedStatus && installerIds[0] ? { jobStatus: JobStatus.ASSIGNED } : {}),
        },
      });
      await tx.jobInstaller.deleteMany({ where: { jobId } });
      if (installerIds.length > 0) {
        await tx.jobInstaller.createMany({ data: installerIds.map((userId) => ({ jobId, userId })) });
      }
      return updated;
    });
  }

  async assignInstaller(id: string, dto: AssignInstallerDto) {
    const job = await this.findOne(id);
    const updated = await this.setInstallers(id, dto.installerIds, { setAssignedStatus: true });
    await this.notifyAssignment(id, dto.installerIds, job.client.businessName);
    return updated;
  }

  async update(id: string, dto: UpdateJobDto) {
    await this.findOne(id);
    await this.prisma.job.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        scheduleDate: dto.scheduleDate,
        remarks: dto.remarks ?? null,
      },
    });
    if (dto.installerIds !== undefined) {
      // Plain edit: sync the installer list only, never touch jobStatus.
      await this.setInstallers(id, dto.installerIds ?? []);
    }
    return this.findOne(id);
  }

  private notifyAssignment(jobId: string, installerIds: string[], clientName: string) {
    return Promise.all(
      installerIds.map((userId) =>
        this.notifications.notify({
          userId,
          title: 'New installation job assigned',
          body: `You've been assigned an installation job for ${clientName}.`,
          eventType: 'job_assigned',
          data: { jobId, route: '/jobs' },
        }),
      ),
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/jobs.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `npx jest src`
Expected: all suites pass (no other spec file references `AssignInstallerDto`, `CreateJobDto`, or `UpdateJobDto` shapes directly, per a repo-wide check with `grep -rn "installerId:" src/*.spec.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/assign-installer.dto.ts src/create-job.dto.ts src/update-job.dto.ts src/jobs.service.ts src/jobs.service.spec.ts
git commit -m "Support assigning multiple installers to a job"
```

---

### Task 5: `JobsService` read/auth path — any assigned installer can act on the job

**Files:**
- Modify: `src/jobs.service.ts` (`updateStatus`, `submitProof`, `assertOwnedByInstaller`)
- Test: `src/jobs.service.spec.ts`

**Interfaces:**
- Consumes: `job.installers: { userId: string }[]` from `findOne()` (Task 4).
- Produces: `assertOwnedByInstaller(id, installerId)` now resolves for **any** installer in `job.installers`, not just an exact `job.installerId` match; same for the `updateStatus` authorization check.

- [ ] **Step 1: Write the failing tests**

Append to `src/jobs.service.spec.ts`, a new `describe` block:

```typescript
describe('JobsService.assertOwnedByInstaller (via submitProof)', () => {
  function makeProofPrisma(installers: { userId: string }[]) {
    const job = {
      id: 'job-1',
      clientId: 'client-1',
      installerId: installers[0]?.userId ?? null,
      client: { businessName: 'Acme' },
      installers,
      jobStatus: 'ON_GOING',
    };
    return {
      job: {
        findUnique: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockResolvedValue(job),
      },
      installationProof: { upsert: jest.fn().mockResolvedValue({}) },
    };
  }

  it('allows a non-primary assigned installer to submit proof', async () => {
    const prisma = makeProofPrisma([{ userId: 'lead-1' }, { userId: 'helper-1' }]);
    const earnings = { ensureInstallationEarning: jest.fn().mockResolvedValue(null) };
    const service = new JobsService(prisma as never, { notify: jest.fn() } as never, earnings as never);

    await expect(
      service.submitProof('job-1', 'helper-1', { photoUrls: ['a.jpg'] } as never),
    ).resolves.toBeDefined();
  });

  it('rejects an installer who is not assigned to the job', async () => {
    const prisma = makeProofPrisma([{ userId: 'lead-1' }]);
    const earnings = { ensureInstallationEarning: jest.fn().mockResolvedValue(null) };
    const service = new JobsService(prisma as never, { notify: jest.fn() } as never, earnings as never);

    await expect(
      service.submitProof('job-1', 'stranger-1', { photoUrls: ['a.jpg'] } as never),
    ).rejects.toThrow('You are not assigned to this job');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/jobs.service.spec.ts`
Expected: FAIL — `assertOwnedByInstaller` still checks `job.installerId !== installerId`, so `helper-1` is wrongly rejected.

- [ ] **Step 3: Update `assertOwnedByInstaller` and `updateStatus`**

In `src/jobs.service.ts`, replace the `assertOwnedByInstaller` method (currently at the bottom of the class) with:

```typescript
  private async assertOwnedByInstaller(id: string, installerId: string) {
    const job = await this.findOne(id);
    const isAssigned = job.installers?.some((row) => row.userId === installerId) ?? job.installerId === installerId;
    if (!isAssigned) {
      throw new ForbiddenException('You are not assigned to this job');
    }
    return job;
  }
```

In `updateStatus`, replace the authorization check:

```typescript
    // Authorization check
    if (role === 'INSTALLER' && job.installerId !== userId) {
      throw new ForbiddenException('You are not assigned to this job');
    }
```

with:

```typescript
    // Authorization check
    const isAssignedInstaller = job.installers?.some((row) => row.userId === userId) ?? job.installerId === userId;
    if (role === 'INSTALLER' && !isAssignedInstaller) {
      throw new ForbiddenException('You are not assigned to this job');
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/jobs.service.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full backend suite**

Run: `npx jest src`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/jobs.service.ts src/jobs.service.spec.ts
git commit -m "Let any assigned installer update status or submit proof"
```

---

### Task 6: Admin-web — multi-select installer assignment UI

**Files:**
- Modify: `admin-web/src/lib/types.ts` (`Job` interface)
- Modify: `admin-web/src/pages/JobsPage.tsx`

**Interfaces:**
- Consumes: `POST /jobs { installerIds }`, `PATCH /jobs/:id { installerIds }`, `PATCH /jobs/:id/assign { installerIds }` (Task 4).
- Produces: no new exports; this is leaf UI.

- [ ] **Step 1: Extend the `Job` type**

In `admin-web/src/lib/types.ts`, update the `Job` interface (currently `admin-web/src/lib/types.ts:96-108`) by adding one field after `installer?: AuthenticatedUser | null;`:

```typescript
  installer?: AuthenticatedUser | null;
  installers?: { user: { id: string; fullName: string } }[];
```

- [ ] **Step 2: Add a small reusable multi-select for installers**

In `admin-web/src/pages/JobsPage.tsx`, add this component near the top of the file, right after the `JOB_STATUSES` constant (`admin-web/src/pages/JobsPage.tsx:14`):

```typescript
function InstallerCheckboxList({
  installers,
  selectedIds,
  onChange,
  idPrefix,
}: {
  installers: AuthenticatedUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  idPrefix: string;
}) {
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem' }}>
      {installers.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No installers found.</span>}
      {installers.map((installer) => (
        <label key={installer.id} htmlFor={`${idPrefix}-${installer.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input
            id={`${idPrefix}-${installer.id}`}
            type="checkbox"
            checked={selectedIds.includes(installer.id)}
            onChange={() => toggle(installer.id)}
          />
          {installer.fullName}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Switch form state from `installerId` to `installerIds`**

Replace the `EMPTY_FORM` constant (`admin-web/src/pages/JobsPage.tsx:13`):

```typescript
const EMPTY_FORM = { clientId: '', installerIds: [] as string[], scheduleDate: '', remarks: '' };
```

Replace the `assignInstallerId` state (`admin-web/src/pages/JobsPage.tsx:23`):

```typescript
  const [assignInstallerIds, setAssignInstallerIds] = useState<string[]>([]);
```

Update `createJob`'s `mutationFn` body (`admin-web/src/pages/JobsPage.tsx:42-51`):

```typescript
  const createJob = useMutation({
    mutationFn: async () =>
      (
        await api.post<Job>('/jobs', {
          clientId: form.clientId,
          installerIds: form.installerIds.length > 0 ? form.installerIds : undefined,
          scheduleDate: form.scheduleDate,
          remarks: form.remarks || undefined,
        })
      ).data,
```

Replace the whole `assignInstaller` mutation (`admin-web/src/pages/JobsPage.tsx:59-67`), since its `onSuccess` also resets the (now renamed) selection state:

```typescript
  const assignInstaller = useMutation({
    mutationFn: async ({ id, installerIds }: { id: string; installerIds: string[] }) =>
      (await api.patch<Job>(`/jobs/${id}/assign`, { installerIds })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setAssigningJobId(null);
      setAssignInstallerIds([]);
    },
  });
```

Update `updateJob`'s `mutationFn` body (`admin-web/src/pages/JobsPage.tsx:69-76`):

```typescript
  const updateJob = useMutation({
    mutationFn: async () =>
      (await api.patch<Job>(`/jobs/${editingJobId}`, {
        clientId: editForm.clientId,
        installerIds: editForm.installerIds,
        scheduleDate: editForm.scheduleDate,
        remarks: editForm.remarks || null,
      })).data,
```

Update `handleAssignSubmit` (`admin-web/src/pages/JobsPage.tsx:89-92`):

```typescript
  const handleAssignSubmit = (event: FormEvent, id: string) => {
    event.preventDefault();
    assignInstaller.mutate({ id, installerIds: assignInstallerIds });
  };
```

Update `openEditForm` (`admin-web/src/pages/JobsPage.tsx:94-102`):

```typescript
  const openEditForm = (job: Job) => {
    setEditForm({
      clientId: job.clientId,
      installerIds: job.installers?.map((row) => row.user.id) ?? (job.installerId ? [job.installerId] : []),
      scheduleDate: String(job.scheduleDate).slice(0, 10),
      remarks: job.remarks ?? '',
    });
    setEditingJobId(job.id);
  };
```

- [ ] **Step 4: Swap the three `<select>` installer pickers for `InstallerCheckboxList`**

Replace the create-form installer field (`admin-web/src/pages/JobsPage.tsx:143-157`):

```typescript
          <div className="field">
            <label>Installers (optional)</label>
            <InstallerCheckboxList
              installers={installersQuery.data ?? []}
              selectedIds={form.installerIds}
              onChange={(ids) => setForm({ ...form, installerIds: ids })}
              idPrefix="create-installer"
            />
          </div>
```

Replace the edit-form installer field (`admin-web/src/pages/JobsPage.tsx:203-215`):

```typescript
          <div className="field">
            <label>Installers (optional)</label>
            <InstallerCheckboxList
              installers={installersQuery.data ?? []}
              selectedIds={editForm.installerIds}
              onChange={(ids) => setEditForm({ ...editForm, installerIds: ids })}
              idPrefix="edit-installer"
            />
          </div>
```

Replace the Assign-modal installer field (`admin-web/src/pages/JobsPage.tsx:261-276`):

```typescript
            <div className="field">
              <label>Installers</label>
              <InstallerCheckboxList
                installers={installersQuery.data ?? []}
                selectedIds={assignInstallerIds}
                onChange={setAssignInstallerIds}
                idPrefix="assign-installer"
              />
            </div>
```

Update the Assign button's `disabled` guard, since there is no longer a `required` single `<select>` — change the submit button (`admin-web/src/pages/JobsPage.tsx:281-283`):

```typescript
              <button type="submit" className="btn btn-primary" disabled={assignInstaller.isPending || assignInstallerIds.length === 0} style={{ flex: 1 }}>
                {assignInstaller.isPending ? 'Assigning…' : 'Assign'}
              </button>
```

- [ ] **Step 5: Update the "Assign" row action and table's Installer column**

Replace the `onAssign` prop wiring on `AdminJobsTable` (`admin-web/src/pages/JobsPage.tsx:292`):

```typescript
      <AdminJobsTable data={jobsQuery.data ?? []} isLoading={jobsQuery.isLoading} isError={jobsQuery.isError} isReadOnly={isReadOnly} onEdit={openEditForm} onAssign={(id, installerIds) => { setAssigningJobId(id); setAssignInstallerIds(installerIds); }} />
```

Update the `AdminJobsTable` prop type and the `onAssign` call site (`admin-web/src/pages/JobsPage.tsx:297-301, 363-365`):

```typescript
function AdminJobsTable({ data, isLoading, isError, isReadOnly = false, onEdit, onAssign }: {
  data: Job[]; isLoading: boolean; isError: boolean; isReadOnly?: boolean;
  onEdit: (job: Job) => void;
  onAssign: (id: string, installerIds: string[]) => void;
}) {
```

```typescript
                        {(job.jobStatus === 'ASSIGNED' || !job.installerId) && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onAssign(job.id, job.installers?.map((row) => row.user.id) ?? [])}>Assign</button>
                        )}
```

Replace the Installer column cell (`admin-web/src/pages/JobsPage.tsx:346`) to show everyone assigned:

```typescript
                  <td>
                    {job.installers && job.installers.length > 0
                      ? job.installers.map((row) => row.user.fullName).join(', ')
                      : <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                  </td>
```

And update the search-matching line (`admin-web/src/pages/JobsPage.tsx:307`) so search still finds jobs by any assigned installer's name:

```typescript
  const filtered = data.filter((job) =>
    matchesSearch(search, job.client?.businessName, job.installers?.map((row) => row.user.fullName).join(' '), job.remarks)
    && (!status || job.jobStatus === status)
    && inDateRange(job.scheduleDate, from, to),
  );
```

- [ ] **Step 6: Type-check and build**

Run: `cd admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/JobsPage.tsx
git commit -m "Support multi-installer assignment in the admin jobs UI"
```

---

### Task 7: Mobile — show the assigned team on a job

**Files:**
- Modify: `mobile/src/types.ts` (`Job` interface)
- Modify: `mobile/app/job/[id].tsx`

**Interfaces:**
- Consumes: `GET /jobs/:id` now including `installers: { user: { id, fullName } }[]` (Task 4/5).

- [ ] **Step 1: Extend the mobile `Job` type**

In `mobile/src/types.ts`, update the `Job` interface (currently `mobile/src/types.ts:37-48`) by adding a field after `remarks: string | null;`:

```typescript
  remarks: string | null;
  installers?: { user: { id: string; fullName: string } }[];
```

- [ ] **Step 2: Show the team in the job detail card**

In `mobile/app/job/[id].tsx`, add a team line right after the address line (`mobile/app/job/[id].tsx:135`):

```typescript
        <Text style={styles.meta}>Address: {job.client?.address ?? '—'}</Text>
        {job.installers && job.installers.length > 1 ? (
          <Text style={styles.meta}>Team: {job.installers.map((row) => row.user.fullName).join(', ')}</Text>
        ) : null}
```

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types.ts mobile/app/job/[id].tsx
git commit -m "Show the assigned installer team on the mobile job detail screen"
```

---

### Task 8: End-to-end verification

**Files:** none (manual/automated verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `npx jest`
Expected: all suites pass, including `installation-earning.util.spec.ts`, `earnings.service.spec.ts`, and `jobs.service.spec.ts`.

- [ ] **Step 2: Type-check both frontends**

Run: `cd admin-web && npx tsc --noEmit && cd ../mobile && npx tsc --noEmit`
Expected: no errors in either project.

- [ ] **Step 3: Manual smoke test in admin-web**

1. Start the backend and admin-web dev servers.
2. Go to **Installations**, click **Schedule installation**, pick a client, check 2-3 installers in the new checkbox list, save.
3. Confirm the jobs table shows all selected names in the Installer column.
4. As one of the non-primary installers, submit the installation proof from the mobile app (or via API) and confirm it succeeds.
5. Check the **Earnings** admin page: confirm one `PENDING` `INSTALLATION` earning row now exists per assigned installer, each showing the equal split amount and a note like `"... · Split 2 ways: ₱250.00 each"`.

- [ ] **Step 4: Final commit (if any smoke-test fixes were needed)**

```bash
git add -A
git commit -m "Fix issues found during multi-installer smoke test"
```

(Skip this step if no changes were needed.)
