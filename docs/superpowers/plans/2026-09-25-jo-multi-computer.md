# Job Order Multi-Computer + Cloud Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A SOFTWARE job order holds one or more computers, each with its own product, price, materials and optional monthly cloud subscription; the cloud total is added to the order's billing.

**Architecture:** New `JobOrderUnit` table (one row per computer) plus `JobOrderItem.unitId` and `JobOrder.cloudTotal`. The server recomputes `salePrice` (= sum of unit prices) and `cloudTotal` on every save, so payments / reports keep reading `salePrice` and only add `cloudTotal` to `computeGrandTotal`. The wizard keeps a `units` draft array; pure helpers live in `admin-web/src/lib/job-order-units.ts`.

**Tech Stack:** NestJS + Prisma (MySQL), Jest (backend, `npm test`), React + Vite + TanStack Query, Vitest (`npm test --prefix admin-web`, files `src/**/*.spec.ts`, node env).

## Global Constraints

- SOFTWARE job orders only; CCTV / Signage behavior unchanged.
- Additive migration only, applied with `npx prisma migrate deploy` (never `migrate dev` / `reset` / `db push` — local DB has drift).
- Do not touch `D:\Metriqa Shoppe` (shares the DB).
- Legacy orders (no units) must keep working: they render as one implicit computer and their items stay general.
- Server ignores client-supplied `salePrice` when units exist and recomputes `salePrice` / `cloudTotal`.
- Discount applies to `salePrice + materials + cloudTotal`.
- Cloud line total = `cloudMonthlyRate × cloudMonths`, only when `cloudEnabled`; `cloudMonths >= 1` when enabled.
- Mobile app is out of scope.

---

## File Structure

- Modify `prisma/schema.prisma` — `JobOrderUnit` model, `JobOrder.cloudTotal`, `JobOrder.units`, `JobOrderItem.unitId/unit`, `SoftwareProduct.jobOrderUnits`.
- Create `prisma/migrations/20260925000000_job_order_units/migration.sql`.
- Modify `src/job-order-pricing.util.ts` (+ `.spec.ts`) — `cloudTotal` param.
- Create `src/job-order-units.util.ts` (+ `.spec.ts`) — pure `unitCloudTotal`, `computeUnitTotals`, `validateUnits`.
- Modify `src/upsert-job-order.dto.ts` — `JobOrderUnitDto`, `units`, `unitKey`.
- Modify `src/job-orders.service.ts` (+ `.spec.ts`) — persist units, map `unitKey`.
- Modify `src/payments.service.ts`, `src/financial-reports.service.ts` — pass `cloudTotal`.
- Modify `admin-web/src/lib/types.ts` — `JobOrderUnit`, `cloudTotal`, `unitId`.
- Create `admin-web/src/lib/job-order-units.ts` (+ `.spec.ts`) — draft helpers, `computeTotals`, `groupItems`.
- Modify `admin-web/src/components/print/PrintTemplate.tsx` — `unitKey` on `LineItem`, per-computer blocks.
- Modify `admin-web/src/pages/JobOrderPage.tsx` — state, Step 1 cards, Step 2 grouping, summary, save/load.

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (models `JobOrder` ~464, `JobOrderItem` ~501, `SoftwareProduct` ~260)
- Create: `prisma/migrations/20260925000000_job_order_units/migration.sql`

**Interfaces:**
- Produces: Prisma client types `prisma.jobOrderUnit`, `JobOrder.cloudTotal`, `JobOrder.units`, `JobOrderItem.unitId`.

- [ ] **Step 1: Edit `schema.prisma`**

In `SoftwareProduct` add the back-relation next to `jobOrders JobOrder[]`:

```prisma
  jobOrderUnits JobOrderUnit[]
```

In `JobOrder`, after the `docType` line add:

```prisma
  /** Sum of every computer's monthly cloud rate × months; server-computed, added to the grand total. */
  cloudTotal   Decimal        @default(0) @map("cloud_total") @db.Decimal(12, 2)
```

and in its relations block after `items JobOrderItem[]`:

```prisma
  units            JobOrderUnit[]
```

In `JobOrderItem`, after `warrantyTier`:

```prisma
  /** null = general item for the whole order (not tied to one computer). */
  unitId          String?      @map("unit_id")
```

and in its relations:

```prisma
  unit          JobOrderUnit?  @relation(fields: [unitId], references: [id], onDelete: SetNull)
```

and add `@@index([unitId])` above `@@map("job_order_items")`.

Add the new model right after `JobOrderItem`:

```prisma
/** One computer/terminal on a SOFTWARE job order, with its own product and optional cloud subscription. */
model JobOrderUnit {
  id               String   @id @default(uuid())
  jobOrderId       String   @map("job_order_id")
  label            String
  sortOrder        Int      @default(0) @map("sort_order")
  productId        String?  @map("product_id")
  price            Decimal  @default(0) @db.Decimal(12, 2)
  cloudEnabled     Boolean  @default(false) @map("cloud_enabled")
  cloudMonthlyRate Decimal? @map("cloud_monthly_rate") @db.Decimal(12, 2)
  cloudMonths      Int?     @map("cloud_months")

  createdAt DateTime @default(now()) @map("created_at")

  jobOrder JobOrder         @relation(fields: [jobOrderId], references: [id], onDelete: Cascade)
  product  SoftwareProduct? @relation(fields: [productId], references: [id], onDelete: SetNull)
  items    JobOrderItem[]

  @@index([jobOrderId])
  @@index([productId])
  @@map("job_order_units")
}
```

- [ ] **Step 2: Write the migration**

`prisma/migrations/20260925000000_job_order_units/migration.sql`:

```sql
-- One row per computer on a SOFTWARE job order, plus the cloud subscription total.
CREATE TABLE `job_order_units` (
    `id` VARCHAR(191) NOT NULL,
    `job_order_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `product_id` VARCHAR(191) NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cloud_enabled` BOOLEAN NOT NULL DEFAULT false,
    `cloud_monthly_rate` DECIMAL(12, 2) NULL,
    `cloud_months` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_order_units_job_order_id_idx`(`job_order_id`),
    INDEX `job_order_units_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `job_orders` ADD COLUMN `cloud_total` DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE `job_order_items` ADD COLUMN `unit_id` VARCHAR(191) NULL;
CREATE INDEX `job_order_items_unit_id_idx` ON `job_order_items`(`unit_id`);

ALTER TABLE `job_order_units` ADD CONSTRAINT `job_order_units_job_order_id_fkey` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_order_units` ADD CONSTRAINT `job_order_units_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `software_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `job_order_items` ADD CONSTRAINT `job_order_items_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `job_order_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate and generate**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema ... is valid" and "Generated Prisma Client".

- [ ] **Step 4: Apply to the local DB (additive)**

Run: `npx prisma migrate deploy`
Expected: `1 migration found ... applied` for `20260925000000_job_order_units`. If Prisma reports drift or asks to reset, STOP and report — do not reset.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260925000000_job_order_units
git commit -m "feat(db): add job_order_units, cloud_total and item unit link"
```

---

### Task 2: Pricing util accepts `cloudTotal`

**Files:**
- Modify: `src/job-order-pricing.util.ts`
- Modify: `src/job-order-pricing.util.spec.ts`
- Modify: `src/payments.service.ts:37-42`
- Modify: `src/financial-reports.service.ts:111-116`

**Interfaces:**
- Produces: `computeGrandTotal(salePrice, discount, discountType, items, cloudTotal = 0): number`

- [ ] **Step 1: Write failing tests** — append inside `describe('computeGrandTotal', ...)` in the spec:

```ts
  it('adds cloudTotal to the subtotal before the discount', () => {
    expect(computeGrandTotal(10000, 0, 'FIXED', [], 1500)).toBe(11500);
    expect(computeGrandTotal(10000, 10, 'PERCENTAGE', [{ quantity: 1, unitPrice: 1000 }], 1000)).toBe(10800);
  });

  it('treats a missing cloudTotal as zero', () => {
    expect(computeGrandTotal(5000, 0, 'FIXED', [])).toBe(5000);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/job-order-pricing.util.spec.ts`
Expected: FAIL (first new test returns 10000, not 11500).

- [ ] **Step 3: Implement** — in `job-order-pricing.util.ts` change the signature and subtotal:

```ts
export function computeGrandTotal(
  salePrice: number,
  discount: number,
  discountType: DiscountTypeLike,
  items: { quantity: number; unitPrice: number }[],
  cloudTotal = 0,
): number {
  const materialsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const subtotal = salePrice + materialsTotal + cloudTotal;
```

- [ ] **Step 4: Pass `cloudTotal` from the two callers.** Both existing specs mock job orders without `cloudTotal`, so default it:

`src/payments.service.ts` — after the `items.map(...)` argument add:

```ts
      Number(jobOrder.cloudTotal ?? 0),
```

`src/financial-reports.service.ts` — after the `items.map(...)` argument add:

```ts
        Number(jo.cloudTotal ?? 0),
```

- [ ] **Step 5: Run all backend tests**

Run: `npx jest src/job-order-pricing.util.spec.ts src/payments.service.spec.ts src/financial-reports.service.spec.ts`
Expected: PASS. (If a spec file name differs, run `npx jest` and expect all PASS.)

- [ ] **Step 6: Commit**

```bash
git add src/job-order-pricing.util.ts src/job-order-pricing.util.spec.ts src/payments.service.ts src/financial-reports.service.ts
git commit -m "feat(jo): include cloud subscription in grand total"
```

---

### Task 3: Units util + DTO + service

**Files:**
- Create: `src/job-order-units.util.ts`, `src/job-order-units.util.spec.ts`
- Modify: `src/upsert-job-order.dto.ts`
- Modify: `src/job-orders.service.ts`
- Modify: `src/job-orders.service.spec.ts`

**Interfaces:**
- Produces (`job-order-units.util.ts`):

```ts
export interface UnitInput {
  key: string; label: string; productId?: string; price: number;
  cloudEnabled?: boolean; cloudMonthlyRate?: number; cloudMonths?: number;
}
export function unitCloudTotal(u: UnitInput): number;
export function computeUnitTotals(units: UnitInput[]): { salePrice: number; cloudTotal: number };
export function validateUnits(units: UnitInput[], itemUnitKeys: (string | undefined)[]): void; // throws BadRequestException
```
- Produces (DTO): `JobOrderUnitDto`, `UpsertJobOrderDto.units?`, `JobOrderItemDto.unitKey?`.

- [ ] **Step 1: Write failing util tests** — `src/job-order-units.util.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { computeUnitTotals, unitCloudTotal, validateUnits } from './job-order-units.util';

const u = (over = {}) => ({ key: 'a', label: 'Computer 1', price: 1000, ...over });

describe('unitCloudTotal', () => {
  it('is rate x months when enabled', () => {
    expect(unitCloudTotal(u({ cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 3 }))).toBe(1500);
  });
  it('is zero when disabled or missing values', () => {
    expect(unitCloudTotal(u({ cloudEnabled: false, cloudMonthlyRate: 500, cloudMonths: 3 }))).toBe(0);
    expect(unitCloudTotal(u({ cloudEnabled: true }))).toBe(0);
  });
});

describe('computeUnitTotals', () => {
  it('sums unit prices and cloud totals, rounded to cents', () => {
    const totals = computeUnitTotals([
      u({ key: 'a', price: 49000, cloudEnabled: true, cloudMonthlyRate: 999.99, cloudMonths: 1 }),
      u({ key: 'b', price: 30000.5 }),
    ]);
    expect(totals).toEqual({ salePrice: 79000.5, cloudTotal: 999.99 });
  });
});

describe('validateUnits', () => {
  it('rejects duplicate keys', () => {
    expect(() => validateUnits([u(), u()], [])).toThrow(BadRequestException);
  });
  it('rejects an item pointing at an unknown unit', () => {
    expect(() => validateUnits([u()], ['zzz'])).toThrow(BadRequestException);
  });
  it('rejects cloud enabled without months >= 1', () => {
    expect(() => validateUnits([u({ cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 0 })], [])).toThrow(BadRequestException);
  });
  it('accepts valid units and general items', () => {
    expect(() => validateUnits([u()], [undefined, 'a'])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/job-order-units.util.spec.ts`
Expected: FAIL "Cannot find module './job-order-units.util'".

- [ ] **Step 3: Implement** — `src/job-order-units.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export interface UnitInput {
  key: string;
  label: string;
  productId?: string;
  price: number;
  cloudEnabled?: boolean;
  cloudMonthlyRate?: number;
  cloudMonths?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly cloud rate × months for one computer; zero unless the subscription is enabled. */
export function unitCloudTotal(u: UnitInput): number {
  if (!u.cloudEnabled) return 0;
  return round2((u.cloudMonthlyRate ?? 0) * (u.cloudMonths ?? 0));
}

/** Server-side source of truth for a SOFTWARE order's system price and cloud total. */
export function computeUnitTotals(units: UnitInput[]): { salePrice: number; cloudTotal: number } {
  return {
    salePrice: round2(units.reduce((s, u) => s + u.price, 0)),
    cloudTotal: round2(units.reduce((s, u) => s + unitCloudTotal(u), 0)),
  };
}

export function validateUnits(units: UnitInput[], itemUnitKeys: (string | undefined)[]): void {
  const keys = new Set<string>();
  for (const u of units) {
    if (keys.has(u.key)) throw new BadRequestException(`Duplicate computer key "${u.key}"`);
    keys.add(u.key);
    if (u.cloudEnabled && (!Number.isInteger(u.cloudMonths) || (u.cloudMonths ?? 0) < 1)) {
      throw new BadRequestException(`"${u.label}": cloud subscription needs at least 1 month`);
    }
  }
  for (const k of itemUnitKeys) {
    if (k !== undefined && !keys.has(k)) {
      throw new BadRequestException(`Item refers to unknown computer "${k}"`);
    }
  }
}
```

- [ ] **Step 4: Run util tests**

Run: `npx jest src/job-order-units.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: DTO** — in `src/upsert-job-order.dto.ts`, add to `JobOrderItemDto` after `warrantyTier`:

```ts
  /** Which computer (JobOrderUnitDto.key in the same request) this line belongs to; omit for a general item. */
  @IsOptional()
  @IsString()
  unitKey?: string;
```

Add before `UpsertJobOrderDto`:

```ts
export class JobOrderUnitDto {
  /** Client-side id used only to link items to this computer within one request. */
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  cloudEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cloudMonthlyRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cloudMonths?: number;
}
```

and in `UpsertJobOrderDto` before `items`:

```ts
  /** SOFTWARE orders only: one entry per computer. When present the server recomputes salePrice and cloudTotal. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobOrderUnitDto)
  units?: JobOrderUnitDto[];
```

- [ ] **Step 6: Write failing service tests.** In `job-orders.service.spec.ts` first extend `buildTx()`:

```ts
    jobOrderUnit: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `unit-${data.sortOrder}`, ...data })),
    },
```
and inside `jobOrderItem` add `createMany: jest.fn().mockResolvedValue({}),`; inside `jobOrder` add
`findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id, job: null, items: [], units: [] })),`.

Append a new `describe`:

```ts
describe('JobOrdersService.upsert with computers', () => {
  const units = [
    { key: 'k1', label: 'Front', productId: 'p1', price: 49000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 2 },
    { key: 'k2', label: 'Back', productId: 'p2', price: 30000 },
  ];

  it('recomputes salePrice/cloudTotal from units and ignores the client salePrice', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, salePrice: 1, units }, user);

    const data = tx.jobOrder.create.mock.calls[0][0].data;
    expect(data.salePrice).toBe(79000);
    expect(data.cloudTotal).toBe(1000);
    expect(data.productId).toBe('p1');
  });

  it('creates units in order and links tagged items to the new unit ids', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      {
        ...baseDto,
        units,
        items: [
          { name: 'Printer', quantity: 1, unitPrice: 100, unitKey: 'k2' },
          { name: 'Router', quantity: 1, unitPrice: 50 },
        ],
      },
      user,
    );

    expect(tx.jobOrderUnit.create).toHaveBeenCalledTimes(2);
    const general = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(general.map((i: { name: string }) => i.name)).toEqual(['Router']);
    expect(tx.jobOrderItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ name: 'Printer', unitId: 'unit-1' })],
    });
  });

  it('deletes old units when re-saving an existing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', status: 'DRAFT' });

    await service.upsert({ ...baseDto, id: 'jo-1', units }, user);

    expect(tx.jobOrderUnit.deleteMany).toHaveBeenCalledWith({ where: { jobOrderId: 'jo-1' } });
  });

  it('rejects an item whose unitKey matches no unit', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await expect(
      service.upsert({ ...baseDto, units, items: [{ name: 'X', quantity: 1, unitPrice: 1, unitKey: 'nope' }] }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps the legacy path when no units are sent', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, salePrice: 10000 }, user);

    const data = tx.jobOrder.create.mock.calls[0][0].data;
    expect(data.salePrice).toBe(10000);
    expect(data.cloudTotal).toBe(0);
    expect(tx.jobOrderUnit.create).not.toHaveBeenCalled();
  });

  it('ignores units on CCTV orders', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, type: 'CCTV', units }, user);

    expect(tx.jobOrderUnit.create).not.toHaveBeenCalled();
    expect(tx.jobOrder.create.mock.calls[0][0].data.salePrice).toBe(10000);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npx jest src/job-orders.service.spec.ts`
Expected: new tests FAIL; the pre-existing tests must still pass (they only needed the extended `buildTx`).

- [ ] **Step 8: Implement in `job-orders.service.ts`.**

Imports:

```ts
import { computeUnitTotals, validateUnits } from './job-order-units.util';
```

Add `units: { orderBy: { sortOrder: 'asc' as const } },` to `INCLUDE_FULL`.

Replace the `data` / `itemsCreate` construction (currently lines 41-66) with:

```ts
    const type = dto.type ?? JobOrderType.SOFTWARE;
    const units = type === JobOrderType.SOFTWARE ? (dto.units ?? []) : [];
    if (units.length) {
      validateUnits(units, dto.items.map((i) => i.unitKey));
    }
    const unitTotals = units.length ? computeUnitTotals(units) : null;

    const data = {
      clientId: dto.clientId,
      productId: unitTotals ? (units[0].productId ?? null) : (dto.productId ?? null),
      salePrice: unitTotals ? unitTotals.salePrice : dto.salePrice,
      cloudTotal: unitTotals ? unitTotals.cloudTotal : 0,
      discount: dto.discount ?? 0,
      discountType: dto.discountType ?? 'FIXED',
      remarks: dto.remarks ?? null,
      status: dto.status ?? JobOrderStatus.DRAFT,
      type,
      cameraCount: dto.cameraCount ?? null,
      cameraRate: dto.cameraRate ?? null,
      laborPct: dto.laborPct ?? null,
      docType: dto.docType ?? DocType.JOB_ORDER,
      includeAgreement: dto.includeAgreement ?? false,
      includesBackofficeExtension: dto.includesBackofficeExtension ?? false,
    };
    const newCompleted = data.status === JobOrderStatus.COMPLETED;

    const toItemRow = (item: (typeof dto.items)[number]) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      inventoryItemId: item.inventoryItemId ?? null,
      warrantyTier: item.warrantyTier ?? 'ACCESSORY',
    });
    // General items (and every item on a legacy/no-units order) are created
    // nested with the order; computer-tagged items need the new unit ids first.
    const itemsCreate = dto.items.filter((i) => !units.length || !i.unitKey).map(toItemRow);
    const unitItems = units.length ? dto.items.filter((i) => i.unitKey) : [];
```

Inside the transaction, in the `existing` branch add `await tx.jobOrderUnit.deleteMany({ where: { jobOrderId: existing.id } });` right after `await tx.jobOrderItem.deleteMany(...)`. Then, after the if/else that sets `jobOrder` and before the inventory reconcile call, add:

```ts
      if (units.length) {
        const keyToId = new Map<string, string>();
        for (const [index, u] of units.entries()) {
          const created = await tx.jobOrderUnit.create({
            data: {
              jobOrderId: jobOrder.id,
              label: u.label,
              sortOrder: index,
              productId: u.productId ?? null,
              price: u.price,
              cloudEnabled: u.cloudEnabled ?? false,
              cloudMonthlyRate: u.cloudEnabled ? (u.cloudMonthlyRate ?? 0) : null,
              cloudMonths: u.cloudEnabled ? (u.cloudMonths ?? 1) : null,
            },
          });
          keyToId.set(u.key, created.id);
        }
        if (unitItems.length) {
          await tx.jobOrderItem.createMany({
            data: unitItems.map((i) => ({
              jobOrderId: jobOrder.id,
              ...toItemRow(i),
              unitId: keyToId.get(i.unitKey!)!,
            })),
          });
        }
        jobOrder = await tx.jobOrder.findUniqueOrThrow({ where: { id: jobOrder.id }, include: INCLUDE_FULL });
      }
```

(`let jobOrder;` is already declared untyped; reassignment is fine.)

- [ ] **Step 9: Run tests**

Run: `npx jest src/job-orders.service.spec.ts src/job-order-units.util.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/job-order-units.util.ts src/job-order-units.util.spec.ts src/upsert-job-order.dto.ts src/job-orders.service.ts src/job-orders.service.spec.ts
git commit -m "feat(jo): persist computers with per-unit price, items and cloud subscription"
```

---

### Task 4: Frontend types + pure helpers

**Files:**
- Modify: `admin-web/src/lib/types.ts` (`JobOrderItem` ~190, `JobOrder` ~206)
- Create: `admin-web/src/lib/job-order-units.ts`, `admin-web/src/lib/job-order-units.spec.ts`

**Interfaces:**
- Produces (types): `JobOrderUnit`; `JobOrder.cloudTotal: string`, `JobOrder.units?: JobOrderUnit[]`; `JobOrderItem.unitId: string | null`.
- Produces (`job-order-units.ts`):

```ts
export interface UnitDraft { _key: string; label: string; productId: string; price: number; cloudEnabled: boolean; cloudMonthlyRate: number; cloudMonths: number }
export const GENERAL_KEY = '__general__';
export const MAX_PREFILL_COMPUTERS = 20;
export function blankUnit(index: number): UnitDraft;            // index is 0-based
export function unitsForCount(count: number): UnitDraft[];      // max(1, min(count, 20)) blanks
export function applyProduct(unit: UnitDraft, product?: SoftwareProduct): UnitDraft;
export function unitCloudTotal(u: UnitDraft): number;
export function sumUnits(units: UnitDraft[]): { systemsTotal: number; cloudTotal: number };
export function fromSavedUnits(saved: JobOrderUnit[]): UnitDraft[];   // _key = saved id
export function legacyUnit(productId: string, salePrice: number): UnitDraft;
export function computeTotals(salePrice: number, discount: number, discountType: 'FIXED' | 'PERCENTAGE', items: { quantity: number; unitPrice: number }[], cloudTotal?: number): { materialsTotal: number; subtotal: number; discountAmt: number; grandTotal: number };
export function groupItems<T extends { unitKey?: string | null }>(items: T[], units: UnitDraft[]): { key: string; unit: UnitDraft | null; items: T[] }[];  // one group per unit, then General (only if it has items)
export function detachItems<T extends { unitKey?: string | null }>(items: T[], unitKey: string): T[];  // unitKey -> undefined
```

- [ ] **Step 1: Types.** In `types.ts` add `unitId: string | null;` to `JobOrderItem`; add before `JobOrder`:

```ts
export interface JobOrderUnit {
  id: string;
  jobOrderId: string;
  label: string;
  sortOrder: number;
  productId: string | null;
  price: string;
  cloudEnabled: boolean;
  cloudMonthlyRate: string | null;
  cloudMonths: number | null;
}
```

and in `JobOrder` add `cloudTotal: string;` after `salePrice` and `units?: JobOrderUnit[];` after `items`.

- [ ] **Step 2: Write failing tests** — `admin-web/src/lib/job-order-units.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyProduct, blankUnit, computeTotals, detachItems, fromSavedUnits, groupItems,
  legacyUnit, sumUnits, unitCloudTotal, unitsForCount,
} from './job-order-units';
import type { SoftwareProduct } from './types';

const product = { id: 'p1', productName: 'NenPos', version: '3.0', licenseType: 'SUBSCRIPTION_MONTHLY', price: '49000', maintenanceFee: '500' } as SoftwareProduct;

describe('unitsForCount', () => {
  it('creates N blank labelled computers, at least 1 and at most 20', () => {
    expect(unitsForCount(2).map((u) => u.label)).toEqual(['Computer 1', 'Computer 2']);
    expect(unitsForCount(0)).toHaveLength(1);
    expect(unitsForCount(500)).toHaveLength(20);
  });
  it('gives each unit a distinct key', () => {
    const keys = unitsForCount(3).map((u) => u._key);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('applyProduct', () => {
  it('fills product, price and cloud rate from the product', () => {
    const u = applyProduct(blankUnit(0), product);
    expect(u).toMatchObject({ productId: 'p1', price: 49000, cloudMonthlyRate: 500 });
  });
  it('clears the product when none is given', () => {
    const u = applyProduct({ ...blankUnit(0), productId: 'p1', price: 5 }, undefined);
    expect(u.productId).toBe('');
  });
});

describe('sumUnits / unitCloudTotal', () => {
  it('sums systems and cloud (rate x months) for enabled units only', () => {
    const a = { ...blankUnit(0), price: 1000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 3 };
    const b = { ...blankUnit(1), price: 2000, cloudEnabled: false, cloudMonthlyRate: 500, cloudMonths: 3 };
    expect(unitCloudTotal(a)).toBe(1500);
    expect(sumUnits([a, b])).toEqual({ systemsTotal: 3000, cloudTotal: 1500 });
  });
});

describe('computeTotals', () => {
  it('adds cloud to the subtotal and applies the discount to it', () => {
    const t = computeTotals(10000, 10, 'PERCENTAGE', [{ quantity: 1, unitPrice: 1000 }], 1000);
    expect(t).toEqual({ materialsTotal: 1000, subtotal: 12000, discountAmt: 1200, grandTotal: 10800 });
  });
  it('defaults cloud to 0 and never goes negative', () => {
    expect(computeTotals(100, 500, 'FIXED', []).grandTotal).toBe(0);
  });
});

describe('fromSavedUnits / legacyUnit', () => {
  it('uses the saved id as the draft key so items can be re-linked', () => {
    const [u] = fromSavedUnits([
      { id: 'srv-1', jobOrderId: 'jo', label: 'Front', sortOrder: 0, productId: 'p1', price: '49000', cloudEnabled: true, cloudMonthlyRate: '500', cloudMonths: 2 },
    ]);
    expect(u).toMatchObject({ _key: 'srv-1', label: 'Front', price: 49000, cloudEnabled: true, cloudMonthlyRate: 500, cloudMonths: 2 });
  });
  it('wraps an order without units in one implicit computer', () => {
    expect(legacyUnit('p1', 49000)).toMatchObject({ label: 'Computer 1', productId: 'p1', price: 49000, cloudEnabled: false });
  });
});

describe('groupItems / detachItems', () => {
  const [a, b] = unitsForCount(2);
  const items = [
    { name: 'x', unitKey: a._key },
    { name: 'y', unitKey: b._key },
    { name: 'z' },
    { name: 'orphan', unitKey: 'gone' },
  ];
  it('groups per computer and puts unlinked/orphaned items under General', () => {
    const groups = groupItems(items, [a, b]);
    expect(groups.map((g) => g.items.map((i) => i.name))).toEqual([['x'], ['y'], ['z', 'orphan']]);
    expect(groups[2].unit).toBeNull();
  });
  it('omits General when it is empty', () => {
    expect(groupItems([{ name: 'x', unitKey: a._key }], [a, b])).toHaveLength(2);
  });
  it('detaches the items of a removed computer to General', () => {
    expect(detachItems(items, a._key)[0].unitKey).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test --prefix admin-web -- job-order-units`
Expected: FAIL "Failed to resolve import './job-order-units'".

- [ ] **Step 4: Implement** — `admin-web/src/lib/job-order-units.ts`:

```ts
import type { JobOrderUnit, SoftwareProduct } from './types';

/** Local (unsaved) state for one computer on a SOFTWARE job order. */
export interface UnitDraft {
  _key: string;
  label: string;
  productId: string;
  price: number;
  cloudEnabled: boolean;
  cloudMonthlyRate: number;
  cloudMonths: number;
}

export const GENERAL_KEY = '__general__';
export const MAX_PREFILL_COMPUTERS = 20;

let unitSeq = 0;
const newUnitKey = () => `unit-${++unitSeq}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function blankUnit(index: number): UnitDraft {
  return {
    _key: newUnitKey(),
    label: `Computer ${index + 1}`,
    productId: '',
    price: 0,
    cloudEnabled: false,
    cloudMonthlyRate: 0,
    cloudMonths: 1,
  };
}

export function unitsForCount(count: number): UnitDraft[] {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, MAX_PREFILL_COMPUTERS));
  return Array.from({ length: n }, (_, i) => blankUnit(i));
}

/** Picks a product for a computer: price and cloud rate follow the product, both stay editable. */
export function applyProduct(unit: UnitDraft, product?: SoftwareProduct): UnitDraft {
  if (!product) return { ...unit, productId: '' };
  return {
    ...unit,
    productId: product.id,
    price: Number(product.price),
    cloudMonthlyRate: product.maintenanceFee != null ? Number(product.maintenanceFee) : unit.cloudMonthlyRate,
  };
}

export function unitCloudTotal(u: UnitDraft): number {
  return u.cloudEnabled ? round2(u.cloudMonthlyRate * u.cloudMonths) : 0;
}

export function sumUnits(units: UnitDraft[]): { systemsTotal: number; cloudTotal: number } {
  return {
    systemsTotal: round2(units.reduce((s, u) => s + u.price, 0)),
    cloudTotal: round2(units.reduce((s, u) => s + unitCloudTotal(u), 0)),
  };
}

export function fromSavedUnits(saved: JobOrderUnit[]): UnitDraft[] {
  return [...saved]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((u) => ({
      _key: u.id,
      label: u.label,
      productId: u.productId ?? '',
      price: Number(u.price),
      cloudEnabled: u.cloudEnabled,
      cloudMonthlyRate: u.cloudMonthlyRate != null ? Number(u.cloudMonthlyRate) : 0,
      cloudMonths: u.cloudMonths ?? 1,
    }));
}

/** An order saved before computers existed renders as a single implicit computer. */
export function legacyUnit(productId: string, salePrice: number): UnitDraft {
  return { ...blankUnit(0), productId, price: salePrice };
}

/** Mirrors the backend computeGrandTotal (src/job-order-pricing.util.ts) exactly. */
export function computeTotals(
  salePrice: number,
  discount: number,
  discountType: 'FIXED' | 'PERCENTAGE',
  items: { quantity: number; unitPrice: number }[],
  cloudTotal = 0,
) {
  const materialsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const subtotal = salePrice + materialsTotal + cloudTotal;
  const discountAmt = discountType === 'PERCENTAGE' ? (subtotal * discount) / 100 : discount;
  const grandTotal = Math.max(0, subtotal - discountAmt);
  return { materialsTotal, subtotal, discountAmt, grandTotal };
}

/** One group per computer (in order), then General for unlinked/orphaned items when non-empty. */
export function groupItems<T extends { unitKey?: string | null }>(
  items: T[],
  units: UnitDraft[],
): { key: string; unit: UnitDraft | null; items: T[] }[] {
  const known = new Set(units.map((u) => u._key));
  const groups = units.map((unit) => ({ key: unit._key, unit, items: items.filter((i) => i.unitKey === unit._key) }));
  const general = items.filter((i) => !i.unitKey || !known.has(i.unitKey));
  return general.length ? [...groups, { key: GENERAL_KEY, unit: null, items: general }] : groups;
}

/** When a computer is removed its items fall back to General rather than being deleted. */
export function detachItems<T extends { unitKey?: string | null }>(items: T[], unitKey: string): T[] {
  return items.map((i) => (i.unitKey === unitKey ? { ...i, unitKey: undefined } : i));
}
```

- [ ] **Step 5: Run tests**

Run: `npm test --prefix admin-web`
Expected: PASS (all vitest specs, including existing).

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/lib/job-order-units.ts admin-web/src/lib/job-order-units.spec.ts
git commit -m "feat(admin-web): computer draft helpers and totals with cloud subscription"
```

---

### Task 5: Wizard — state, Step 1 cards, save/load, prefill

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx`
- Modify: `admin-web/src/components/print/PrintTemplate.tsx:4-12` (only `LineItem.unitKey`, so the page type-checks)

**Interfaces:**
- Consumes: everything exported by `job-order-units.ts` (Task 4).
- Produces: page-level `units: UnitDraft[]`, `setUnits`, `systemsTotal`, `cloudTotal`, `effectiveSalePrice`; `LineItem.unitKey?: string | null`.

- [ ] **Step 1: `LineItem` gets `unitKey`.** In `PrintTemplate.tsx` add to `LineItem`:

```ts
  unitKey?: string | null; // local computer key (UnitDraft._key); null/undefined = general item
```

- [ ] **Step 2: Imports and removal of the local `computeTotals`.** In `JobOrderPage.tsx` import:

```ts
import {
  GENERAL_KEY, MAX_PREFILL_COMPUTERS, applyProduct, blankUnit, computeTotals, detachItems,
  fromSavedUnits, groupItems, legacyUnit, sumUnits, unitCloudTotal, unitsForCount, type UnitDraft,
} from '../lib/job-order-units';
```

Delete the local `computeTotals` function (lines 255-263, the whole "Computed totals" block). In `fromSaved(item)` add `unitKey: item.unitId ?? undefined,` to the returned object.

- [ ] **Step 3: State.** Replace `const [productId, setProductId] = useState('');` with:

```ts
  const [units, setUnits] = useState<UnitDraft[]>(() => [blankUnit(0)]);
  const [activeUnitKey, setActiveUnitKey] = useState('');
```

Keep `salePrice` state (used by CCTV / Signage).

- [ ] **Step 4: Populate from saved order.** In the "Populate from saved job order" effect replace `setProductId(jo.productId || ''); setSalePrice(Number(jo.salePrice));` with:

```ts
    setSalePrice(Number(jo.salePrice));
    setUnits(
      jo.units && jo.units.length > 0
        ? fromSavedUnits(jo.units)
        : [legacyUnit(jo.productId ?? '', Number(jo.salePrice))],
    );
```

- [ ] **Step 5: Parent auto-populate + delete price effect.** Replace `if (job.license?.productId) setProductId(job.license.productId);` and the whole "Auto-fill sale price when product changes" effect with:

```ts
    const licensedProduct = productsQuery.data?.find((p) => p.id === job.license?.productId);
    if (licensedProduct) {
      setUnits((prev) => (prev[0] && !prev[0].productId ? [applyProduct(prev[0], licensedProduct), ...prev.slice(1)] : prev));
    }
```

(add `productsQuery.data` to that effect's dependency array; the setter only fires while the first computer has no product, so it cannot loop).

- [ ] **Step 6: Prefill computers from the client's declared count.** Add after the parent auto-populate effect:

```ts
  // New order: once a client is picked, open one card per computer they declared.
  const prefilledFor = useRef('');
  useEffect(() => {
    if (jobOrderQuery.data || jobOrderQuery.isPending || joType !== 'SOFTWARE') return;
    if (!clientId || prefilledFor.current === clientId) return;
    const c = clientsQuery.data?.find((x) => x.id === clientId);
    if (!c) return;
    prefilledFor.current = clientId;
    if (c.computerCount && c.computerCount > 0) {
      setUnits((prev) => (prev.every((u) => !u.productId) ? unitsForCount(c.computerCount!) : prev));
    }
  }, [clientId, clientsQuery.data, jobOrderQuery.data, jobOrderQuery.isPending, joType]);
```

- [ ] **Step 7: Derived totals.** Replace the `computeTotals(salePrice, ...)` line (631) and `const product = ...` with:

```ts
  const isSoftware = joType === 'SOFTWARE';
  const unitSums = sumUnits(units);
  const effectiveSalePrice = isSoftware ? unitSums.systemsTotal : salePrice;
  const cloudTotal = isSoftware ? unitSums.cloudTotal : 0;
  const { materialsTotal, subtotal, discountAmt, grandTotal } = computeTotals(
    effectiveSalePrice, discount, discountType, items, cloudTotal,
  );
```

Change `canSave`:

```ts
  const canSave = !!clientId && (isSoftware ? units.length > 0 && units.every((u) => !!u.productId) : true);
```

Everywhere the file used `salePrice` for display/labor/print, use `effectiveSalePrice`: `laborIncentive` (SIGNAGE stays `salePrice`, it is not SOFTWARE so equal), PrintTemplate `salePrice=` prop, Order Summary row. Remove the now-unused `product` variable and its `List price` usage (moved to cards in Step 9).

- [ ] **Step 8: Item helpers tag the active computer.** Add after `addInventoryItem`'s declaration area:

```ts
  // Where newly added items/packages land: the chosen computer, or General.
  const addTarget = !isSoftware || activeUnitKey === GENERAL_KEY
    ? undefined
    : (units.find((u) => u._key === activeUnitKey)?._key ?? units[0]?._key);
```

Add `unitKey: addTarget,` to the object created in `addInventoryItem`, in `expandPackage`'s mapped object, and in `addCustom` (`{ _key: newKey(), ...customForm, unitKey: addTarget }`). `addTarget` is computed later in the component than `expandPackage`; since those are called from event handlers after render, define `isSoftware`/`addTarget` BEFORE `expandPackage` by moving the two derived-total lines' `isSoftware`, `unitSums` and `addTarget` declarations up next to the state declarations (right after `activeUnitKey`), and keep the totals line where it is.

- [ ] **Step 9: Save payload.** In the `upsert` mutation body replace `productId: ...` and `salePrice,` and the items mapping with:

```ts
          productId: isSoftware ? units[0]?.productId || undefined : undefined,
          salePrice: effectiveSalePrice,
          units: isSoftware
            ? units.map((u) => ({
                key: u._key,
                label: u.label,
                productId: u.productId || undefined,
                price: u.price,
                cloudEnabled: u.cloudEnabled,
                cloudMonthlyRate: u.cloudEnabled ? u.cloudMonthlyRate : undefined,
                cloudMonths: u.cloudEnabled ? u.cloudMonths : undefined,
              }))
            : undefined,
```

and in the items mapping destructure `unitKey` too: `items.map(({ name, description, quantity, unitPrice, inventoryItemId, warrantyTier, unitKey }) => ({ ..., unitKey: isSoftware ? (unitKey ?? undefined) : undefined }))`.

- [ ] **Step 10: Step 1 UI.** Replace the SOFTWARE "System / Software" select block (`{joType === 'SOFTWARE' && (<div className="field"> ... jo-product ...)}`) with nothing (the client field then sits alone in the grid), and replace the Sale Price `<div className="field">` so it only renders for non-SOFTWARE:

```tsx
                {!isSoftware && (
                  <div className="field">
                    {/* existing Sale/Contract/Signage price label + input, minus the "List price" hint */}
                  </div>
                )}
```

Insert this block immediately after the closing `</div>` of the two-column grid, guarded by `isSoftware`:

```tsx
              {isSoftware && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {client?.computerCount != null && client.computerCount !== units.length && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Client declares {client.computerCount} computer{client.computerCount === 1 ? '' : 's'}; this order has {units.length}.
                    </p>
                  )}
                  {units.map((unit, index) => {
                    const unitProduct = productsQuery.data?.find((p) => p.id === unit.productId);
                    const patch = (p: Partial<UnitDraft>) =>
                      setUnits((prev) => prev.map((u) => (u._key === unit._key ? { ...u, ...p } : u)));
                    return (
                      <div key={unit._key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', background: 'var(--surface-secondary)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                          <div className="field">
                            <label htmlFor={`unit-label-${unit._key}`}>Computer</label>
                            <input id={`unit-label-${unit._key}`} value={unit.label} onChange={(e) => patch({ label: e.target.value })} />
                          </div>
                          <div className="field">
                            <label htmlFor={`unit-product-${unit._key}`}>System / Software</label>
                            <select
                              id={`unit-product-${unit._key}`}
                              required
                              value={unit.productId}
                              onChange={(e) =>
                                setUnits((prev) =>
                                  prev.map((u) =>
                                    u._key === unit._key
                                      ? applyProduct(u, productsQuery.data?.find((p) => p.id === e.target.value))
                                      : u,
                                  ),
                                )
                              }
                            >
                              <option value="">Select product…</option>
                              {productsQuery.data?.map((p) => (
                                <option key={p.id} value={p.id}>{p.productName} v{p.version}</option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor={`unit-price-${unit._key}`}>Sale Price (₱)</label>
                            <input
                              id={`unit-price-${unit._key}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={unit.price}
                              onChange={(e) => patch({ price: Number(e.target.value) || 0 })}
                            />
                            {unitProduct && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                List price: ₱{Number(unitProduct.price).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="field">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={unit.cloudEnabled}
                                onChange={(e) => patch({ cloudEnabled: e.target.checked })}
                              />
                              Cloud subscription (monthly)
                            </label>
                            {unit.cloudEnabled && (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.5rem', marginTop: '0.35rem' }}>
                                  <input
                                    aria-label="Monthly rate"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={unit.cloudMonthlyRate}
                                    onChange={(e) => patch({ cloudMonthlyRate: Number(e.target.value) || 0 })}
                                  />
                                  <input
                                    aria-label="Months"
                                    type="number"
                                    min={1}
                                    value={unit.cloudMonths}
                                    onChange={(e) => patch({ cloudMonths: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                                  />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  ₱{unit.cloudMonthlyRate.toLocaleString()}/mo × {unit.cloudMonths} = ₱{unitCloudTotal(unit).toLocaleString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {units.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', color: 'var(--danger)' }}
                            onClick={() => {
                              setUnits((prev) => prev.filter((u) => u._key !== unit._key));
                              setItems((prev) => detachItems(prev, unit._key));
                            }}
                          >
                            Remove {unit.label || `computer ${index + 1}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem' }}
                      onClick={() => setUnits((prev) => [...prev, blankUnit(prev.length)])}
                    >
                      + Add computer
                    </button>
                  </div>
                </div>
              )}
```

Note `MAX_PREFILL_COMPUTERS` is only used inside the helper; drop it from the page import if the linter flags it unused.

- [ ] **Step 11: Type-check and lint**

Run: `npm run build --prefix admin-web` (runs `tsc -b && vite build`) and `npm run lint --prefix admin-web`
Expected: no errors from `JobOrderPage.tsx`. (Steps 6–7 of Task 6 finish the remaining references; if `tsc` reports `PrintTemplate` props `product`/`salePrice`, proceed to Task 6 before re-running.)

- [ ] **Step 12: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx admin-web/src/components/print/PrintTemplate.tsx
git commit -m "feat(admin-web): computer cards with per-computer product and cloud subscription"
```

---

### Task 6: Step 2 grouping, summary panel, print

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx` (Step 2 ~1080-1260, Order Summary ~1372-1436, PrintTemplate usage ~793)
- Modify: `admin-web/src/components/print/PrintTemplate.tsx`

**Interfaces:**
- Consumes: `groupItems`, `unitCloudTotal`, `UnitDraft`, `GENERAL_KEY` (Task 4); `addTarget`, `activeUnitKey`, `setActiveUnitKey` (Task 5).
- Produces (PrintTemplate props): `units?: PrintUnit[]`, `products?: SoftwareProduct[]`; `PrintUnit = UnitDraft`.

- [ ] **Step 1: "Adding to" selector (Step 2).** Directly above the search `<form onSubmit={handleScan}>` add:

```tsx
                {isSoftware && (
                  <div className="field" style={{ marginBottom: '0.5rem' }}>
                    <label htmlFor="jo-add-target">Adding to</label>
                    <select
                      id="jo-add-target"
                      value={addTarget ?? GENERAL_KEY}
                      onChange={(e) => setActiveUnitKey(e.target.value)}
                    >
                      {units.map((u) => (
                        <option key={u._key} value={u._key}>{u.label || 'Computer'}</option>
                      ))}
                      <option value={GENERAL_KEY}>General (whole order)</option>
                    </select>
                  </div>
                )}
```

- [ ] **Step 2: Grouped items table.** Define before the `return` (near `agreementSections`):

```ts
  const itemGroups = isSoftware
    ? groupItems(items, units)
    : [{ key: 'all', unit: null as UnitDraft | null, items }];
```

Replace `{items.length > 0 && (<table style={{ marginBottom: '0.75rem' }}> ... </table>)}` with the same table wrapped per group. Keep the existing `<thead>` and row markup unchanged, but iterate `group.items` and number rows within the group:

```tsx
              {itemGroups.map((group) =>
                group.items.length > 0 ? (
                  <div key={group.key} style={{ marginBottom: '0.75rem' }}>
                    {isSoftware && (
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0.25rem 0' }}>
                        {group.unit ? group.unit.label || 'Computer' : 'General'}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                          {' '}— ₱{group.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <table>
                      {/* existing <thead> unchanged */}
                      <tbody>
                        {group.items.map((item, index) => (
                          {/* existing <tr key={item._key}> ... </tr>, unchanged */}
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null,
              )}
```

(The row body already uses `item._key`, `updateItem`, `removeItem`, so it works unchanged with `group.items`.)

- [ ] **Step 3: Order Summary.** Change the first summary row's amount to `₱{effectiveSalePrice.toLocaleString()}` with label `isSoftware ? \`System / Software (${units.length} computer${units.length === 1 ? '' : 's'})\` : ...`, and insert directly after the Materials row:

```tsx
                  {cloudTotal > 0 && (
                    <tr>
                      <td style={{ color: 'var(--text-muted)', paddingLeft: 0, borderBottom: 'none' }}>Cloud subscription</td>
                      <td style={{ textAlign: 'right', paddingRight: 0, borderBottom: 'none' }}>₱{cloudTotal.toLocaleString()}</td>
                    </tr>
                  )}
```

- [ ] **Step 4: PrintTemplate props.** In `PrintTemplate.tsx` replace `product?: SoftwareProduct;` usage: keep `product` and `salePrice` (used for legacy/non-computer render) and add

```ts
  units?: UnitDraft[];
  products?: SoftwareProduct[];
```

(import `type UnitDraft, groupItems, unitCloudTotal` from `../../lib/job-order-units`), destructure `units, products` in the component, then replace the "Software Main Item" block and the "Materials" block with:

```tsx
      {units && units.length > 0 ? (
        groupItems(items, units).map((group) => {
          const prod = group.unit ? products?.find((x) => x.id === group.unit!.productId) : undefined;
          const groupTotal = group.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
          return (
            <div key={group.key} style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '10pt', marginBottom: '16pt' }}>
              <strong>{group.unit ? `${group.unit.label || 'Computer'} — System / Software` : 'General Materials'}</strong>
              {group.unit && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8pt', fontSize: '11pt' }}>
                  <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Item</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Details</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #ccc', padding: '6pt' }}>{prod?.productName ?? '—'}</td>
                      <td style={{ border: '1px solid #ccc', padding: '6pt' }}>v{prod?.version ?? '—'}</td>
                      <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(group.unit.price)}</td>
                    </tr>
                    {group.unit.cloudEnabled && (
                      <tr>
                        <td style={{ border: '1px solid #ccc', padding: '6pt' }}>Cloud subscription</td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt' }}>
                          {p(group.unit.cloudMonthlyRate)} / month × {group.unit.cloudMonths} mo
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(unitCloudTotal(group.unit))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              {group.items.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8pt', fontSize: '11pt' }}>
                  <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Item</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Description</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'center' }}>Qty</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #ccc', padding: '6pt' }}>{item.name}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt', color: '#555' }}>{item.description || '—'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>{p(item.unitPrice)}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(item.quantity * item.unitPrice)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>Materials Total</td>
                      <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(groupTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      ) : (
        <>
          {/* existing "Software Main Item" block and "Materials" block, unchanged (legacy / CCTV / Signage) */}
        </>
      )}
```

Wrap the two existing blocks exactly as they are inside the `<>` fallback; the totals block, receipt text, remarks and signatures stay untouched (each computer block already shows its cloud row and the grand total includes it).

- [ ] **Step 5: Pass units to the print template.** In the `<PrintTemplate ... />` call in `JobOrderPage.tsx` remove `product={product}`, set `salePrice={effectiveSalePrice}`, and add:

```tsx
          units={isSoftware ? units : undefined}
          products={productsQuery.data}
```

Since `product` is no longer needed by callers that pass `units`, keep the `product?: SoftwareProduct` prop optional in `PrintTemplate` (the legacy fallback branch still reads it; for a SOFTWARE order `units` is always set, so the fallback only serves CCTV/Signage where the software row was already `—` before).

- [ ] **Step 6: Type-check, lint, tests**

Run: `npm run build --prefix admin-web && npm run lint --prefix admin-web && npm test --prefix admin-web`
Expected: build OK, lint clean, vitest PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx admin-web/src/components/print/PrintTemplate.tsx
git commit -m "feat(admin-web): group materials per computer, show cloud subscription in summary and print"
```

---

### Task 7: End-to-end verification and spec sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-jo-multi-computer-design.md` (Print section)

- [ ] **Step 1: Sync the spec's Print section** with what was built: replace "Totals block gains the cloud line." with "Each computer block shows its own cloud subscription row; the totals block is unchanged (the grand total already includes cloud)."

- [ ] **Step 2: Full automated run**

Run: `npx jest && npm test --prefix admin-web && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 3: Manual check (dev servers: `npm run dev`)**
1. Clients page → set a client's "No. of computers" to 2.
2. Job Orders → new SOFTWARE order → pick that client → 2 Computer cards appear, hint absent.
3. Pick a different product on each; price and cloud rate auto-fill; enable cloud on Computer 1 (rate 500 × 2 months) → summary shows Cloud subscription ₱1,000 and Grand Total = systems + materials + 1,000.
4. Step 2 → "Adding to" Computer 2 → add an item and an Item Package → they appear under Computer 2's group; add one to General.
5. Save Draft → reload the page → cards, cloud settings and item groups all restored.
6. Print preview → per-computer blocks with cloud row; grand total matches the summary.
7. Save → Payments step → the balance equals the printed grand total.
8. Open a pre-existing (legacy) order → shows one implicit "Computer 1"; saving keeps its total unchanged.
9. Remove a computer that has items → items move to General.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-25-jo-multi-computer-design.md
git commit -m "docs: sync multi-computer spec print section with implementation"
```

---

## Self-Review

- **Spec coverage:** data model (Task 1); pricing incl. discount over cloud (Tasks 2, 4); API validation, `unitKey` mapping, recompute, SOFTWARE-only (Task 3); prefill from `computerCount`, hint, cards with cloud block beside price, add/remove computer (Task 5); grouped Step 2 + "Adding to" selector + summary (Task 6); print (Task 6); legacy handling (Tasks 4–5: `legacyUnit`, legacy service path); tests (Tasks 2–4) and manual flow (Task 7). Spec's "totals block gains cloud line" is replaced by per-computer cloud rows and the spec is synced in Task 7.
- **Placeholders:** none; the two "unchanged existing markup" notes in Task 6 point to code that is moved verbatim, not new behavior.
- **Type consistency:** `UnitDraft`, `groupItems`, `unitCloudTotal`, `applyProduct`, `unitsForCount`, `detachItems`, `computeTotals`, `GENERAL_KEY` and backend `UnitInput`/`computeUnitTotals`/`validateUnits`/`unitKey` are named identically everywhere they are used.
- **Known limits (call out to user):** KPIs/earnings that read `salePrice` continue to exclude cloud subscription revenue; mobile screens show `salePrice` without cloud.
