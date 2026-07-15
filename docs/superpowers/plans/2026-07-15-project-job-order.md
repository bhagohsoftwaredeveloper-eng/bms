# Project Job Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Software JO" to "Project Job Order" and support CCTV and Signage project types with automatic installer labor incentives (per-camera for CCTV, percentage-of-price for Signage).

**Architecture:** A `type` enum on `JobOrder` (default SOFTWARE keeps existing rows/behavior). Labor math lives as a pure function next to the existing pricing utils; earning creation lives in a standalone testable function called inside the existing `upsert` transaction in `JobOrdersService`. Frontend adds a Project Type selector with conditional fields and a live labor summary; labels rename from "Software JO" to "Project JO".

**Tech Stack:** NestJS + Prisma (MySQL), Jest, React + TanStack Query (admin-web).

**Spec:** `docs/superpowers/specs/2026-07-15-project-job-order-design.md`

## Global Constraints

- New `JobOrderType` enum values exactly: `SOFTWARE`, `CCTV`, `SIGNAGE`; column default `SOFTWARE`.
- Signage labor percentage defaults to **20** when not provided.
- Labor incentive is internal only — `computeGrandTotal` and the invoice/print template are **unchanged**.
- Earning created on finalize: `type: INSTALLATION`, status defaults to `PENDING`, one per `jobId` (idempotent).
- Statuses that require/create the labor earning: `FINALIZED`, `ON_GOING`, `COMPLETED` (not DRAFT/CANCELLED).
- Rename is labels only; route `/job-orders/software` stays.
- Backend tests: `npm test` from repo root. Frontend check: `npx tsc -b --noEmit` in `admin-web`.
- Mobile app is out of scope.

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (enum near the other enums ~line 104; fields in `model JobOrder` ~line 382)

**Interfaces:**
- Produces: `JobOrderType` enum and `JobOrder.type/cameraCount/cameraRate/laborPct` columns; `@prisma/client` exports `JobOrderType` after generate. Tasks 2–3 import `JobOrderType` from `@prisma/client`.

- [ ] **Step 1: Add the enum**

In `prisma/schema.prisma`, directly after the `JobOrderStatus` enum (lines 104–110), add:

```prisma
enum JobOrderType {
  SOFTWARE
  CCTV
  SIGNAGE
}
```

- [ ] **Step 2: Add the fields to `model JobOrder`**

Inside `model JobOrder`, after the `status` line (`status       JobOrderStatus @default(DRAFT)`), add:

```prisma
  type         JobOrderType   @default(SOFTWARE)
  cameraCount  Int?           @map("camera_count")
  cameraRate   Decimal?       @map("camera_rate") @db.Decimal(12, 2)
  laborPct     Decimal?       @map("labor_pct") @db.Decimal(5, 2)
```

- [ ] **Step 3: Run the migration**

Run: `npx prisma migrate dev --name project_job_order_types`
Expected: new folder under `prisma/migrations/`, "Your database is now in sync", client regenerated. (Local MySQL runs at `localhost:3306`, db `sdlmp` per `.env`.)

- [ ] **Step 4: Verify backend still compiles**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add JobOrderType enum and labor fields to JobOrder"
```

---

### Task 2: `computeLaborIncentive` pure util (TDD)

**Files:**
- Modify: `src/job-order-pricing.util.ts`
- Test: `src/job-order-pricing.util.spec.ts` (append a describe block)

**Interfaces:**
- Produces:
  ```ts
  export function computeLaborIncentive(
    type: 'SOFTWARE' | 'CCTV' | 'SIGNAGE',
    salePrice: number,
    cameraCount: number | null | undefined,
    cameraRate: number | null | undefined,
    laborPct: number | null | undefined,
  ): number
  ```
  CCTV → `cameraCount × cameraRate` (missing values count as 0). SIGNAGE → `salePrice × (laborPct ?? 20) / 100`. SOFTWARE → 0. Task 3 and the frontend mirror this exact math.

- [ ] **Step 1: Write the failing tests**

Append to `src/job-order-pricing.util.spec.ts`:

```ts
import { computeLaborIncentive } from './job-order-pricing.util';

describe('computeLaborIncentive', () => {
  it('returns 0 for SOFTWARE regardless of inputs', () => {
    expect(computeLaborIncentive('SOFTWARE', 50000, 8, 500, 20)).toBe(0);
  });

  it('CCTV: cameraCount × cameraRate', () => {
    expect(computeLaborIncentive('CCTV', 120000, 8, 500, null)).toBe(4000);
  });

  it('CCTV: missing count or rate yields 0', () => {
    expect(computeLaborIncentive('CCTV', 120000, null, 500, null)).toBe(0);
    expect(computeLaborIncentive('CCTV', 120000, 8, null, null)).toBe(0);
  });

  it('SIGNAGE: salePrice × laborPct / 100', () => {
    expect(computeLaborIncentive('SIGNAGE', 35000, null, null, 25)).toBe(8750);
  });

  it('SIGNAGE: laborPct defaults to 20 when missing', () => {
    expect(computeLaborIncentive('SIGNAGE', 35000, null, null, null)).toBe(7000);
  });
});
```

Note: the existing spec file already imports from `./job-order-pricing.util`; merge the import (`import { computeGrandTotal, computeBalance, computeLaborIncentive } from './job-order-pricing.util';`) instead of adding a duplicate import line if the file already has one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- job-order-pricing.util.spec`
Expected: FAIL — `computeLaborIncentive` is not exported.

- [ ] **Step 3: Implement**

Append to `src/job-order-pricing.util.ts`:

```ts
/**
 * Installer labor incentive per project type. Internal cost only — never part
 * of the client invoice / grand total.
 */
export function computeLaborIncentive(
  type: 'SOFTWARE' | 'CCTV' | 'SIGNAGE',
  salePrice: number,
  cameraCount: number | null | undefined,
  cameraRate: number | null | undefined,
  laborPct: number | null | undefined,
): number {
  if (type === 'CCTV') return (cameraCount ?? 0) * (cameraRate ?? 0);
  if (type === 'SIGNAGE') return (salePrice * (laborPct ?? 20)) / 100;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- job-order-pricing.util.spec`
Expected: PASS (existing + 5 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/job-order-pricing.util.ts src/job-order-pricing.util.spec.ts
git commit -m "feat: computeLaborIncentive util for CCTV/Signage labor"
```

---

### Task 3: Backend — DTO fields, persistence, and finalize auto-Earning (TDD)

**Files:**
- Create: `src/job-order-labor.util.ts`
- Test (create): `src/job-order-labor.util.spec.ts`
- Modify: `src/upsert-job-order.dto.ts`
- Modify: `src/job-orders.service.ts`

**Interfaces:**
- Consumes: `computeLaborIncentive` from Task 2; `JobOrderType` from `@prisma/client` (Task 1).
- Produces:
  ```ts
  export async function ensureLaborEarning(tx: LaborEarningTx, jobOrder: LaborJobOrder): Promise<void>
  ```
  called inside the `upsert` transaction; throws `BadRequestException` when a CCTV/Signage JO reaches FINALIZED/ON_GOING/COMPLETED without an installer or with zero labor. `UpsertJobOrderDto` gains optional `type`, `cameraCount`, `cameraRate`, `laborPct` — the frontend (Task 5) sends these names exactly.

- [ ] **Step 1: Write the failing tests**

Create `src/job-order-labor.util.spec.ts`:

```ts
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
  salePrice: 120000,
  cameraCount: 8,
  cameraRate: 500,
  laborPct: null,
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

  it('computes signage labor from laborPct (default 20)', async () => {
    const tx = fakeTx();
    await ensureLaborEarning(tx, {
      ...baseCctv,
      type: 'SIGNAGE',
      salePrice: 35000,
      cameraCount: null,
      cameraRate: null,
      laborPct: null,
    });
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

  it('rejects finalize when labor computes to zero', async () => {
    const tx = fakeTx();
    await expect(
      ensureLaborEarning(tx, { ...baseCctv, cameraCount: null, cameraRate: null }),
    ).rejects.toThrow('Enter the number of cameras and rate per camera before finalizing.');
    await expect(
      ensureLaborEarning(tx, {
        ...baseCctv, type: 'SIGNAGE', salePrice: 0, laborPct: 20,
      }),
    ).rejects.toThrow('Signage labor is zero — check the total price and labor % before finalizing.');
  });

  it('also ensures the earning for ON_GOING and COMPLETED statuses', async () => {
    for (const status of ['ON_GOING', 'COMPLETED'] as const) {
      const tx = fakeTx();
      await ensureLaborEarning(tx, { ...baseCctv, status });
      expect(tx.earning.create).toHaveBeenCalled();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- job-order-labor.util.spec`
Expected: FAIL — cannot find module `./job-order-labor.util`.

- [ ] **Step 3: Implement `ensureLaborEarning`**

Create `src/job-order-labor.util.ts`:

```ts
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
  salePrice: unknown;
  cameraCount: number | null;
  cameraRate: unknown;
  laborPct: unknown;
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
    Number(jobOrder.salePrice),
    jobOrder.cameraCount,
    jobOrder.cameraRate === null ? null : Number(jobOrder.cameraRate),
    jobOrder.laborPct === null ? null : Number(jobOrder.laborPct),
  );
  if (labor <= 0) {
    throw new BadRequestException(
      jobOrder.type === 'CCTV'
        ? 'Enter the number of cameras and rate per camera before finalizing.'
        : 'Signage labor is zero — check the total price and labor % before finalizing.',
    );
  }

  const existing = await tx.earning.findFirst({
    where: { jobId: jobOrder.jobId, type: 'INSTALLATION' },
  });
  if (existing) return;

  await tx.earning.create({
    data: { userId: installerId, jobId: jobOrder.jobId, amount: labor, type: 'INSTALLATION' },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- job-order-labor.util.spec`
Expected: PASS (8 tests).

- [ ] **Step 5: Extend the DTO**

In `src/upsert-job-order.dto.ts`:
- Change the class-validator import line to include `Max`: `import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';`
- Change the Prisma import to `import { DiscountType, JobOrderStatus, JobOrderType } from '@prisma/client';`
- Add to `UpsertJobOrderDto` (after the `status` property):

```ts
  @IsOptional()
  @IsEnum(JobOrderType)
  type?: JobOrderType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cameraCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cameraRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  laborPct?: number;
```

- [ ] **Step 6: Wire into the service**

In `src/job-orders.service.ts`:
- Change the Prisma import to `import { JobOrderStatus, JobOrderType } from '@prisma/client';`
- Add `import { ensureLaborEarning } from './job-order-labor.util';`
- In `upsert`, extend the `data` object (after the `status` line):

```ts
      type: dto.type ?? JobOrderType.SOFTWARE,
      cameraCount: dto.cameraCount ?? null,
      cameraRate: dto.cameraRate ?? null,
      laborPct: dto.laborPct ?? null,
```

- Inside the transaction, after the `await this.inventory.applyJobOrderStock(...)` call and before `return jobOrder;`, add:

```ts
      // CCTV/Signage: guarantee the installer's labor earning once finalized.
      await ensureLaborEarning(tx, jobOrder);
```

(`jobOrder` already carries `job` via `INCLUDE_FULL` and the new scalar columns.)

- [ ] **Step 7: Full backend check**

Run: `npx tsc -p tsconfig.build.json --noEmit`, then `npm test`
Expected: exit 0; all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add src/job-order-labor.util.ts src/job-order-labor.util.spec.ts src/upsert-job-order.dto.ts src/job-orders.service.ts
git commit -m "feat: auto-create installer labor earning when CCTV/Signage JO finalizes"
```

---

### Task 4: Frontend — types, renames, and Type column

**Files:**
- Modify: `admin-web/src/lib/types.ts` (JobOrder interface ~line 167)
- Modify: `admin-web/src/pages/JobOrdersPage.tsx`
- Modify: `admin-web/src/layouts/AdminLayout.tsx` (4 nav entries, lines 64/103/113/129)
- Modify: `admin-web/src/pages/DashboardPage.tsx` (line 639)

**Interfaces:**
- Consumes: backend now returns `type`, `cameraCount`, `cameraRate`, `laborPct` on job orders.
- Produces: `export type JobOrderType = 'SOFTWARE' | 'CCTV' | 'SIGNAGE';` in `types.ts`; Task 5 imports it.

- [ ] **Step 1: Extend types**

In `admin-web/src/lib/types.ts`, above `export interface JobOrder {` add:

```ts
export type JobOrderType = 'SOFTWARE' | 'CCTV' | 'SIGNAGE';
```

and inside `JobOrder`, after `status: JobOrderStatus;` add:

```ts
  type: JobOrderType;
  cameraCount: number | null;
  cameraRate: string | null;
  laborPct: string | null;
```

- [ ] **Step 2: Rename labels**

- `AdminLayout.tsx`: replace all 4 occurrences of `label: 'Software JO'` with `label: 'Project JO'`.
- `DashboardPage.tsx` line 639: `Software JOs` → `Project JOs`.
- `JobOrdersPage.tsx`: `<h1>` "Software JO" → "Project Job Order"; subtitle → `List of all software, CCTV, and signage installation job orders.`; button "Create Software JO" → "Create Project JO".

- [ ] **Step 3: Add Type column to JobOrdersPage**

In `JobOrdersPage.tsx`, add near the top of the file (after imports):

```ts
import type { Job, JobOrder, JobOrderType } from '../lib/types';

const JO_TYPE_LABELS: Record<JobOrderType, string> = {
  SOFTWARE: 'Software',
  CCTV: 'CCTV',
  SIGNAGE: 'Signage',
};
```

(replacing the existing `import type { Job, JobOrder } from '../lib/types';`)

In the table header, insert `<th>Type</th>` between `<th>Client</th>` and `<th>Product</th>`. In the row body, insert between the client `<td>` and product `<td>`:

```tsx
                    <td>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                        {JO_TYPE_LABELS[jo.type] ?? jo.type}
                      </span>
                    </td>
```

and change the product cell to tolerate non-software orders:

```tsx
                    <td>{jo.product?.productName ?? (jo.type === 'SOFTWARE' ? jo.productId : '—')}</td>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit` (in `admin-web`)
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/JobOrdersPage.tsx admin-web/src/layouts/AdminLayout.tsx admin-web/src/pages/DashboardPage.tsx
git commit -m "feat(admin-web): rename Software JO to Project JO; add Type column"
```

---

### Task 5: Frontend — JobOrderPage type selector, conditional fields, labor summary

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx`

**Interfaces:**
- Consumes: `JobOrderType` from `../lib/types` (Task 4); DTO field names `type`, `cameraCount`, `cameraRate`, `laborPct` (Task 3); labor math mirrors `computeLaborIncentive` (Task 2).
- Produces: nothing further.

- [ ] **Step 1: Imports and state**

- Add `JobOrderType` to the type import list (line 36).
- After the existing form-state block (`const [items, setItems] = ...` area, ~line 327), add:

```ts
  const [joType, setJoType] = useState<JobOrderType>('SOFTWARE');
  const [cameraCount, setCameraCount] = useState(0);
  const [cameraRate, setCameraRate] = useState(0);
  const [laborPct, setLaborPct] = useState(20);
```

- [ ] **Step 2: Populate from saved order**

In the "Populate from saved job order" `useEffect` (~line 341), after `setItems(...)` add:

```ts
    setJoType(jo.type ?? 'SOFTWARE');
    setCameraCount(jo.cameraCount ?? 0);
    setCameraRate(jo.cameraRate != null ? Number(jo.cameraRate) : 0);
    setLaborPct(jo.laborPct != null ? Number(jo.laborPct) : 20);
```

- [ ] **Step 3: Send the fields on save**

In the `upsert` mutation payload (~line 377), add after `status,`:

```ts
          type: joType,
          productId: joType === 'SOFTWARE' ? productId : undefined,
          cameraCount: joType === 'CCTV' && cameraCount > 0 ? cameraCount : undefined,
          cameraRate: joType === 'CCTV' ? cameraRate : undefined,
          laborPct: joType === 'SIGNAGE' ? laborPct : undefined,
```

and **remove** the existing bare `productId,` line (it is replaced by the conditional one above).

- [ ] **Step 4: Relax `canSave` for non-software types**

Replace `const canSave = !!clientId && !!productId;` (~line 480) with:

```ts
  const canSave = !!clientId && (joType === 'SOFTWARE' ? !!productId : true);
```

- [ ] **Step 5: Surface backend error messages**

Replace the `upsert.isError` paragraph (~line 675) with:

```tsx
        {upsert.isError && (
          <p className="error-text" style={{ marginBottom: '1rem' }}>
            {(upsert.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Could not save the job order. Check required fields and try again.'}
          </p>
        )}
```

(This makes "Assign an installer to the job before finalizing." visible.)

- [ ] **Step 6: Project Type selector + conditional fields**

In the "Client & System" card, insert a full-width field **above** the existing grid `<div style={{ display: 'grid', ... }}>`:

```tsx
              <div className="field">
                <label htmlFor="jo-type">Project Type</label>
                <select id="jo-type" value={joType} onChange={(e) => setJoType(e.target.value as JobOrderType)}>
                  <option value="SOFTWARE">Software</option>
                  <option value="CCTV">CCTV Installation</option>
                  <option value="SIGNAGE">Signage Installation</option>
                </select>
              </div>
```

Then wrap the existing **System / Software** select field in `{joType === 'SOFTWARE' && ( ... )}` and add, right after it (inside the same grid):

```tsx
                {joType === 'CCTV' && (
                  <>
                    <div className="field">
                      <label htmlFor="jo-camera-count">No. of Cameras</label>
                      <input id="jo-camera-count" type="number" min={0} value={cameraCount}
                        onChange={(e) => setCameraCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                    </div>
                    <div className="field">
                      <label htmlFor="jo-camera-rate">Rate per Camera (₱)</label>
                      <input id="jo-camera-rate" type="number" min={0} step="0.01" value={cameraRate}
                        onChange={(e) => setCameraRate(Number(e.target.value) || 0)} />
                    </div>
                  </>
                )}
                {joType === 'SIGNAGE' && (
                  <div className="field">
                    <label htmlFor="jo-labor-pct">Labor %</label>
                    <input id="jo-labor-pct" type="number" min={0} max={100} step="0.01" value={laborPct}
                      onChange={(e) => setLaborPct(Number(e.target.value) || 0)} />
                  </div>
                )}
```

Also make the sale-price label type-aware — replace `<label htmlFor="jo-sale-price">Sale Price (₱)</label>` with:

```tsx
                  <label htmlFor="jo-sale-price">
                    {joType === 'SIGNAGE' ? 'Total Signage Price (₱)' : joType === 'CCTV' ? 'Contract Price (₱)' : 'Sale Price (₱)'}
                  </label>
```

And update the section heading `<h2>Client & System</h2>` → `<h2>Client & Project</h2>`, plus the Order Summary row label `System / Software` (in the aside table, ~line 974) → `{joType === 'SOFTWARE' ? 'System / Software' : joType === 'CCTV' ? 'CCTV Contract' : 'Signage'}`.

- [ ] **Step 7: Installer Labor summary card**

Compute the labor near the `computeTotals` call (~line 473):

```ts
  const laborIncentive =
    joType === 'CCTV' ? cameraCount * cameraRate
    : joType === 'SIGNAGE' ? (salePrice * laborPct) / 100
    : 0;
  const installerName = parent?.installer?.fullName;
```

In the right-column `<aside>`, after the Order Summary card, add:

```tsx
            {joType !== 'SOFTWARE' && (
              <div className="card">
                <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Installer Labor</h2>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent)' }}>
                  ₱{laborIncentive.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {joType === 'CCTV'
                    ? `${cameraCount} camera${cameraCount === 1 ? '' : 's'} × ₱${cameraRate.toLocaleString()}`
                    : `${laborPct}% of ₱${salePrice.toLocaleString()}`}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.6rem' }}>
                  {installerName ? (
                    <>Installer: <strong>{installerName}</strong></>
                  ) : (
                    <span style={{ color: 'var(--warning)' }}>
                      ⚠ No installer assigned to this job — finalize will be blocked.
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 0 }}>
                  Internal cost — not shown on the client invoice. A pending earning is created for the installer when this JO is finalized.
                </p>
              </div>
            )}
```

- [ ] **Step 8: Rename page labels**

In `JobOrderPage.tsx`: all three `← Back to Software JO` buttons → `← Back to Project JO`, and the `<h1>Software JO</h1>` → `<h1>Project Job Order</h1>`. The print template is intentionally untouched.

- [ ] **Step 9: Type-check**

Run: `npx tsc -b --noEmit` (in `admin-web`)
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): project type selector with CCTV/Signage labor summary on JO page"
```

---

### Task 6: Build, deploy locally, manual verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything above. The local backend runs under pm2 as `beulah-backend` serving `dist/main.js`; `npm run build` builds admin-web + backend.

- [ ] **Step 1: Full test + build**

Run: `npm test` then `npm run build`
Expected: all suites pass; Vite + Nest build succeed.

- [ ] **Step 2: Restart the running backend**

Run: `pm2 restart beulah-backend --update-env`
Expected: process online; `curl.exe -s http://localhost:3001/api/job-orders` returns 401 (route alive).

- [ ] **Step 3: Manual verification checklist**

1. Sidebar shows **Project JO**; list page titled "Project Job Order" with the Type column (existing orders show "Software").
2. Create a CCTV JO: pick a job **with an installer**, set type CCTV, contract price, 8 cameras × ₱500 → labor card shows ₱4,000 → Finalize → Earnings page shows a PENDING ₱4,000 INSTALLATION earning for the installer; re-saving the JO does not duplicate it.
3. Create a Signage JO: total price ₱35,000, labor 20% → labor card shows ₱7,000 → finalize creates the earning.
4. Finalizing a CCTV/Signage JO on a job **without** an installer shows "Assign an installer to the job before finalizing." and nothing saves.
5. A Software JO behaves exactly as before (product required, no labor card, invoice unchanged).
