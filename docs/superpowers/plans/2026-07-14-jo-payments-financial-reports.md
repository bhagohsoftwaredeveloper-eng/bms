# Job Order Payments & Financial Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SUPER_ADMIN, ADMIN_STAFF, and SALES_STAFF record multiple payments (downpayments/installments) against a Job Order, see a live balance, void mistaken entries, and view financial reports (collections, outstanding balances, per-client history) with CSV export — on both admin-web and mobile.

**Architecture:** A new `Payment` model (one-to-many off `JobOrder`), balance computed on read (never stored) from a shared `computeGrandTotal`/`computeBalance` pure-function pair that mirrors the existing print-invoice math. Two new backend controllers (`PaymentsController`, `FinancialReportsController`) in one `PaymentsModule`. Admin-web gets a `JobOrderPayments` panel plus a new `FinancialReportsPage`. Mobile gets `SALES_STAFF` access to the existing admin section plus a new Job Order detail screen.

**Tech Stack:** NestJS + Prisma (MySQL) backend, React + TanStack Query + React Router admin-web, Expo Router + Axios mobile.

## Global Constraints

- Voiding a payment never deletes the row — `voidedAt`/`voidReason`/`voidedById` are set, the record stays for audit. There is no edit endpoint.
- Balance = `grandTotal − SUM(payment.amount WHERE voidedAt IS NULL)`, computed at read time. `grandTotal` must match the existing print-invoice formula in `admin-web/src/pages/JobOrderPage.tsx:198-204` exactly (includes line items, not just `salePrice − discount`).
- Only `SUPER_ADMIN`/`ADMIN_STAFF` can void a payment. `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF` can all record payments and view reports.
- Payment proof photo upload reuses the existing generic `POST /uploads/images` endpoint (`src/uploads.controller.ts`) — no new upload wiring.
- All new Prisma fields follow the existing snake_case `@map`/`@@map` convention (see `prisma/schema.prisma:373-411`).

---

### Task 1: Prisma schema — `Payment` model + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `PaymentMethod` enum (`CASH | BANK_TRANSFER | GCASH | CHECK`), `Payment` model with fields `id, jobOrderId, amount, method, referenceNo, proofPhotoUrl, paidAt, recordedById, voidedAt, voidReason, voidedById, createdAt`. `JobOrder.payments: Payment[]`. `User.paymentsRecorded: Payment[]`, `User.paymentsVoided: Payment[]`.

- [ ] **Step 1: Add the enum and model to the schema**

In `prisma/schema.prisma`, add the enum next to the other enums (after `enum DiscountType` at line ~95):

```prisma
enum PaymentMethod {
  CASH
  BANK_TRANSFER
  GCASH
  CHECK
}
```

Add the model directly after `model JobOrderItem` (after line 411):

```prisma
model Payment {
  id            String        @id @default(uuid())
  jobOrderId    String        @map("job_order_id")
  amount        Decimal       @db.Decimal(12, 2)
  method        PaymentMethod
  referenceNo   String?       @map("reference_no")
  proofPhotoUrl String?       @map("proof_photo_url")
  paidAt        DateTime      @map("paid_at")
  recordedById  String        @map("recorded_by_id")
  voidedAt      DateTime?     @map("voided_at")
  voidReason    String?       @map("void_reason") @db.Text
  voidedById    String?       @map("voided_by_id")
  createdAt     DateTime      @default(now()) @map("created_at")

  jobOrder   JobOrder @relation(fields: [jobOrderId], references: [id])
  recordedBy User     @relation("PaymentRecordedBy", fields: [recordedById], references: [id])
  voidedBy   User?    @relation("PaymentVoidedBy", fields: [voidedById], references: [id])

  @@map("payments")
}
```

Add `payments Payment[]` to `model JobOrder` (after the `items` line, ~line 390):

```prisma
  items     JobOrderItem[]
  payments  Payment[]
```

Add the two inverse relations to `model User` (after the `incentives Incentive[]` line, ~line 151):

```prisma
  paymentsRecorded  Payment[] @relation("PaymentRecordedBy")
  paymentsVoided    Payment[] @relation("PaymentVoidedBy")
```

- [ ] **Step 2: Format and validate the schema**

Run: `npx prisma format`
Expected: no errors; the command rewrites the file with consistent alignment.

- [ ] **Step 3: Create and apply the migration**

Run: `npx prisma migrate dev --name add_job_order_payments`
Expected: a new folder under `prisma/migrations/` (timestamp prefix + `add_job_order_payments`), ending with "Your database is now in sync with your schema." The Prisma client regenerates automatically.

- [ ] **Step 4: Verify the generated client has the new types**

Run: `node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); console.log(typeof p.payment.findMany)"`
Expected: prints `function`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Payment model for JO payments, discounts, downpayments"
```

---

### Task 2: Pricing helpers — `computeGrandTotal` / `computeBalance` (TDD)

**Files:**
- Create: `src/job-order-pricing.util.ts`
- Test: `src/job-order-pricing.util.spec.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `computeGrandTotal(salePrice: number, discount: number, discountType: 'FIXED' | 'PERCENTAGE', items: { quantity: number; unitPrice: number }[]): number` and `computeBalance(grandTotal: number, payments: { amount: number; voidedAt: Date | null }[]): number`. Used by Task 4 and Task 5.

- [ ] **Step 1: Write the failing tests**

Create `src/job-order-pricing.util.spec.ts`:

```typescript
import { computeGrandTotal, computeBalance } from './job-order-pricing.util';

describe('computeGrandTotal', () => {
  it('applies a FIXED discount and adds line items', () => {
    expect(computeGrandTotal(10000, 1000, 'FIXED', [{ quantity: 2, unitPrice: 500 }])).toBe(10000);
  });

  it('applies a PERCENTAGE discount', () => {
    expect(computeGrandTotal(10000, 10, 'PERCENTAGE', [])).toBe(9000);
  });

  it('treats zero discount as no discount', () => {
    expect(computeGrandTotal(5000, 0, 'FIXED', [])).toBe(5000);
  });

  it('never lets the discounted software total go negative', () => {
    expect(computeGrandTotal(100, 500, 'FIXED', [])).toBe(0);
  });

  it('sums multiple line items', () => {
    expect(
      computeGrandTotal(0, 0, 'FIXED', [
        { quantity: 3, unitPrice: 100 },
        { quantity: 1, unitPrice: 50 },
      ]),
    ).toBe(350);
  });
});

describe('computeBalance', () => {
  it('subtracts active payments from the grand total', () => {
    expect(computeBalance(1000, [{ amount: 400, voidedAt: null }])).toBe(600);
  });

  it('excludes voided payments from the sum', () => {
    expect(
      computeBalance(1000, [
        { amount: 400, voidedAt: null },
        { amount: 300, voidedAt: new Date() },
      ]),
    ).toBe(600);
  });

  it('allows a negative balance on overpayment', () => {
    expect(computeBalance(1000, [{ amount: 1500, voidedAt: null }])).toBe(-500);
  });

  it('returns the full grand total when there are no payments', () => {
    expect(computeBalance(750, [])).toBe(750);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest job-order-pricing.util --no-coverage`
Expected: FAIL with "Cannot find module './job-order-pricing.util'".

- [ ] **Step 3: Write the implementation**

Create `src/job-order-pricing.util.ts`:

```typescript
export type DiscountTypeLike = 'FIXED' | 'PERCENTAGE';

/**
 * Mirrors admin-web's computeTotals() in JobOrderPage.tsx exactly, so a
 * client's payment balance always matches the total on their printed invoice.
 */
export function computeGrandTotal(
  salePrice: number,
  discount: number,
  discountType: DiscountTypeLike,
  items: { quantity: number; unitPrice: number }[],
): number {
  const materialsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmt = discountType === 'PERCENTAGE' ? (salePrice * discount) / 100 : discount;
  const softwareTotal = Math.max(0, salePrice - discountAmt);
  return softwareTotal + materialsTotal;
}

export function computeBalance(
  grandTotal: number,
  payments: { amount: number; voidedAt: Date | null }[],
): number {
  const totalPaid = payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + p.amount, 0);
  return grandTotal - totalPaid;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest job-order-pricing.util --no-coverage`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/job-order-pricing.util.ts src/job-order-pricing.util.spec.ts
git commit -m "feat: add computeGrandTotal/computeBalance pricing helpers"
```

---

### Task 3: CSV helper — `toCsv` (TDD)

**Files:**
- Create: `src/csv.util.ts`
- Test: `src/csv.util.spec.ts`

**Interfaces:**
- Produces: `toCsv(rows: Record<string, string | number>[]): string`. Used by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `src/csv.util.spec.ts`:

```typescript
import { toCsv } from './csv.util';

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('writes a header row from the first row keys', () => {
    expect(toCsv([{ a: 1, b: 'x' }])).toBe('a,b\n1,x');
  });

  it('quotes fields containing commas', () => {
    expect(toCsv([{ name: 'Doe, John', amount: 100 }])).toBe('name,amount\n"Doe, John",100');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(toCsv([{ note: 'He said "hi"' }])).toBe('note\n"He said ""hi"""');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest csv.util --no-coverage`
Expected: FAIL with "Cannot find module './csv.util'".

- [ ] **Step 3: Write the implementation**

Create `src/csv.util.ts`:

```typescript
export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number): string => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))];
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest csv.util --no-coverage`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/csv.util.ts src/csv.util.spec.ts
git commit -m "feat: add toCsv helper for report export"
```

---

### Task 4: Backend — record/list/void payments

**Files:**
- Create: `src/record-payment.dto.ts`
- Create: `src/void-payment.dto.ts`
- Create: `src/payments.service.ts`
- Create: `src/payments.controller.ts`
- Create: `src/payments.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `computeGrandTotal`, `computeBalance` from Task 2 (`./job-order-pricing.util`).
- Produces: `POST /api/job-orders/:id/payments`, `GET /api/job-orders/:id/payments` → `{ grandTotal: number; totalPaid: number; balance: number; payments: Payment[] }`, `POST /api/payments/:id/void`. Consumed by Task 5 (module registration), Task 6 (admin-web), Task 8/9 (mobile).

- [ ] **Step 1: Create the DTOs**

Create `src/record-payment.dto.ts`:

```typescript
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  proofPhotoUrl?: string;

  @IsDateString()
  paidAt!: string;
}
```

Create `src/void-payment.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class VoidPaymentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
```

- [ ] **Step 2: Create the service**

Create `src/payments.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.type';
import { PrismaService } from './prisma.service';
import { RecordPaymentDto } from './record-payment.dto';
import { computeBalance, computeGrandTotal } from './job-order-pricing.util';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadJobOrderWithPayments(jobOrderId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id: jobOrderId },
      include: { items: true, payments: { orderBy: { paidAt: 'desc' } } },
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${jobOrderId} not found`);
    return jobOrder;
  }

  async recordPayment(jobOrderId: string, dto: RecordPaymentDto, user: AuthenticatedUser) {
    await this.loadJobOrderWithPayments(jobOrderId);
    return this.prisma.payment.create({
      data: {
        jobOrderId,
        amount: dto.amount,
        method: dto.method,
        referenceNo: dto.referenceNo ?? null,
        proofPhotoUrl: dto.proofPhotoUrl ?? null,
        paidAt: new Date(dto.paidAt),
        recordedById: user.id,
      },
    });
  }

  async listForJobOrder(jobOrderId: string) {
    const jobOrder = await this.loadJobOrderWithPayments(jobOrderId);
    const grandTotal = computeGrandTotal(
      Number(jobOrder.salePrice),
      Number(jobOrder.discount),
      jobOrder.discountType,
      jobOrder.items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
    );
    const balance = computeBalance(
      grandTotal,
      jobOrder.payments.map((p) => ({ amount: Number(p.amount), voidedAt: p.voidedAt })),
    );
    return { grandTotal, totalPaid: grandTotal - balance, balance, payments: jobOrder.payments };
  }

  async voidPayment(paymentId: string, reason: string, user: AuthenticatedUser) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    if (payment.voidedAt) throw new BadRequestException('Payment is already voided');
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: user.id },
    });
  }
}
```

- [ ] **Step 3: Create the controller**

Create `src/payments.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RecordPaymentDto } from './record-payment.dto';
import { VoidPaymentDto } from './void-payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
  @Post('job-orders/:id/payments')
  record(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.recordPayment(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
  @Get('job-orders/:id/payments')
  list(@Param('id') id: string) {
    return this.paymentsService.listForJobOrder(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('payments/:id/void')
  voidPayment(@Param('id') id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.voidPayment(id, dto.reason, user);
  }
}
```

- [ ] **Step 4: Create the module**

Create `src/payments.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
```

- [ ] **Step 5: Wire into `AppModule`**

In `src/app.module.ts`, add the import near the other feature-module imports (after `import { NotificationsModule } from './notifications.module';`, alphabetically close to `Payments`):

```typescript
import { PaymentsModule } from './payments.module';
```

Add `PaymentsModule` to the `imports` array (after `JobOrdersModule,`):

```typescript
    JobOrdersModule,
    PaymentsModule,
```

- [ ] **Step 6: Run existing tests to confirm nothing broke**

Run: `npx jest --no-coverage`
Expected: all suites PASS (existing suites + Task 2/3 suites).

- [ ] **Step 7: Manual verification against a running backend**

Start the backend (`npm run start:dev`, or use the already-running instance). Log in to get a token and export it, then exercise the three endpoints against a real Job Order id (`JOID` — get one from `GET /api/job-orders`):

```bash
API=http://localhost:3002/api
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_ADMIN_PASSWORD"}' | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).accessToken))")
JOID=$(curl -s $API/job-orders -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d)[0].id))")

curl -s -X POST $API/job-orders/$JOID/payments -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"amount":1000,"method":"CASH","paidAt":"2026-07-14T00:00:00.000Z"}'
curl -s $API/job-orders/$JOID/payments -H "Authorization: Bearer $TOKEN"
```

Expected: the POST returns the created payment with an `id`; the GET returns `{ grandTotal, totalPaid: 1000, balance: grandTotal-1000, payments: [...] }`. Copy the payment `id` from the response and void it:

```bash
PID=<paste the payment id>
curl -s -X POST $API/payments/$PID/void -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"test void"}'
curl -s $API/job-orders/$JOID/payments -H "Authorization: Bearer $TOKEN"
```

Expected: the void succeeds; the follow-up GET shows `totalPaid: 0`, `balance` back to `grandTotal`, and the payment listed with a non-null `voidedAt`.

- [ ] **Step 8: Commit**

```bash
git add src/record-payment.dto.ts src/void-payment.dto.ts src/payments.service.ts src/payments.controller.ts src/payments.module.ts src/app.module.ts
git commit -m "feat: add payments API (record, list with balance, void)"
```

---

### Task 5: Backend — financial reports (collections, outstanding, client history, CSV export)

**Files:**
- Create: `src/financial-reports.service.ts`
- Create: `src/financial-reports.controller.ts`
- Modify: `src/payments.module.ts`

**Interfaces:**
- Consumes: `computeGrandTotal`, `computeBalance` (Task 2), `toCsv` (Task 3).
- Produces: `GET /api/reports/financial/collections?from&to`, `GET /api/reports/financial/outstanding`, `GET /api/reports/financial/client/:clientId`, `GET /api/reports/financial/export?type=collections|outstanding`. Consumed by Task 7 (admin-web Financial Reports page).

- [ ] **Step 1: Create the service**

Create `src/financial-reports.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { computeBalance, computeGrandTotal } from './job-order-pricing.util';
import { toCsv } from './csv.util';

export interface CollectionsSummary {
  from: string | null;
  to: string | null;
  totalCollected: number;
  byMethod: { method: PaymentMethod; total: number; count: number }[];
}

export interface OutstandingRow {
  jobOrderId: string;
  clientId: string;
  clientName: string;
  grandTotal: number;
  totalPaid: number;
  balance: number;
  lastPaymentAt: string | null;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async collectionsSummary(from?: string, to?: string): Promise<CollectionsSummary> {
    const payments = await this.prisma.payment.findMany({
      where: {
        voidedAt: null,
        ...(from || to
          ? { paidAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
    });

    const byMethodMap = new Map<PaymentMethod, { total: number; count: number }>();
    let totalCollected = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      totalCollected += amount;
      const entry = byMethodMap.get(p.method) ?? { total: 0, count: 0 };
      entry.total += amount;
      entry.count += 1;
      byMethodMap.set(p.method, entry);
    }

    return {
      from: from ?? null,
      to: to ?? null,
      totalCollected,
      byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
    };
  }

  async outstandingBalances(): Promise<OutstandingRow[]> {
    const jobOrders = await this.prisma.jobOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: { items: true, payments: { where: { voidedAt: null } }, client: true },
    });

    const rows: OutstandingRow[] = [];
    for (const jo of jobOrders) {
      const grandTotal = computeGrandTotal(
        Number(jo.salePrice),
        Number(jo.discount),
        jo.discountType,
        jo.items.map((item) => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) })),
      );
      const paymentsForBalance = jo.payments.map((p) => ({ amount: Number(p.amount), voidedAt: p.voidedAt }));
      const balance = computeBalance(grandTotal, paymentsForBalance);
      if (balance <= 0) continue;

      const lastPayment = [...jo.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
      rows.push({
        jobOrderId: jo.id,
        clientId: jo.clientId,
        clientName: jo.client.businessName,
        grandTotal,
        totalPaid: grandTotal - balance,
        balance,
        lastPaymentAt: lastPayment ? lastPayment.paidAt.toISOString() : null,
      });
    }
    return rows;
  }

  async clientHistory(clientId: string) {
    const [client, jobOrders] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId } }),
      this.prisma.jobOrder.findMany({
        where: { clientId },
        include: { payments: { where: { voidedAt: null } } },
      }),
    ]);

    const payments = jobOrders
      .flatMap((jo) => jo.payments.map((p) => ({ ...p, jobOrderId: jo.id })))
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    return { clientId, clientName: client?.businessName ?? 'Unknown', payments };
  }

  async collectionsCsv(from?: string, to?: string): Promise<string> {
    const summary = await this.collectionsSummary(from, to);
    return toCsv(summary.byMethod.map((m) => ({ method: m.method, total: m.total, count: m.count })));
  }

  async outstandingCsv(): Promise<string> {
    const rows = await this.outstandingBalances();
    return toCsv(
      rows.map((r) => ({
        jobOrderId: r.jobOrderId,
        client: r.clientName,
        grandTotal: r.grandTotal,
        totalPaid: r.totalPaid,
        balance: r.balance,
        lastPaymentAt: r.lastPaymentAt ?? '',
      })),
    );
  }
}
```

- [ ] **Step 2: Create the controller**

Create `src/financial-reports.controller.ts`:

```typescript
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { FinancialReportsService } from './financial-reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
@Controller('reports/financial')
export class FinancialReportsController {
  constructor(private readonly reportsService: FinancialReportsService) {}

  @Get('collections')
  collections(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.collectionsSummary(from, to);
  }

  @Get('outstanding')
  outstanding() {
    return this.reportsService.outstandingBalances();
  }

  @Get('client/:clientId')
  clientHistory(@Param('clientId') clientId: string) {
    return this.reportsService.clientHistory(clientId);
  }

  @Get('export')
  async export(
    @Query('type') type: 'collections' | 'outstanding',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const csv =
      type === 'outstanding' ? await this.reportsService.outstandingCsv() : await this.reportsService.collectionsCsv(from, to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    res.send(csv);
  }
}
```

- [ ] **Step 3: Register in `PaymentsModule`**

Update `src/payments.module.ts` to the full content:

```typescript
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FinancialReportsController } from './financial-reports.controller';
import { FinancialReportsService } from './financial-reports.service';

@Module({
  controllers: [PaymentsController, FinancialReportsController],
  providers: [PaymentsService, FinancialReportsService],
})
export class PaymentsModule {}
```

- [ ] **Step 4: Manual verification**

Using the `$API`/`$TOKEN` from Task 4 Step 7 (record at least one payment first if you haven't):

```bash
curl -s "$API/reports/financial/collections" -H "Authorization: Bearer $TOKEN"
curl -s "$API/reports/financial/outstanding" -H "Authorization: Bearer $TOKEN"
curl -s "$API/reports/financial/export?type=collections" -H "Authorization: Bearer $TOKEN"
```

Expected: `collections` returns `{ totalCollected, byMethod: [{ method: "CASH", total, count }] }`; `outstanding` returns an array including the Job Order you paid (if its balance is still > 0); `export` returns raw CSV text starting with `method,total,count`.

- [ ] **Step 5: Commit**

```bash
git add src/financial-reports.service.ts src/financial-reports.controller.ts src/payments.module.ts
git commit -m "feat: add financial reports API (collections, outstanding, client history, CSV export)"
```

---

### Task 6: Admin-web — Payments panel on the Job Order page

**Files:**
- Modify: `admin-web/src/lib/types.ts`
- Create: `admin-web/src/components/JobOrderPayments.tsx`
- Modify: `admin-web/src/pages/JobOrderPage.tsx`

**Interfaces:**
- Consumes: `GET /job-orders/:id/payments`, `POST /job-orders/:id/payments`, `POST /payments/:id/void`, `POST /uploads/images` (Task 4, existing).
- Produces: `<JobOrderPayments jobOrderId={string} canVoid={boolean} />`, rendered from `JobOrderPage.tsx` once a Job Order exists.

- [ ] **Step 1: Add types**

In `admin-web/src/lib/types.ts`, add after the `JobOrder` interface (after line 171):

```typescript
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'GCASH' | 'CHECK';

export interface Payment {
  id: string;
  jobOrderId: string;
  amount: string;
  method: PaymentMethod;
  referenceNo: string | null;
  proofPhotoUrl: string | null;
  paidAt: string;
  recordedById: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedById: string | null;
  createdAt: string;
}

export interface JobOrderPayments {
  grandTotal: number;
  totalPaid: number;
  balance: number;
  payments: Payment[];
}
```

- [ ] **Step 2: Create the panel component**

Create `admin-web/src/components/JobOrderPayments.tsx`:

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../lib/api';
import type { JobOrderPayments as JobOrderPaymentsData, PaymentMethod } from '../lib/types';

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK'];
const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function JobOrderPayments({ jobOrderId, canVoid }: { jobOrderId: string; canVoid: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const paymentsQuery = useQuery({
    queryKey: ['job-order-payments', jobOrderId],
    queryFn: async () => (await api.get<JobOrderPaymentsData>(`/job-orders/${jobOrderId}/payments`)).data,
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      let proofPhotoUrl: string | undefined;
      if (photoFile) {
        const fd = new FormData();
        fd.append('files', photoFile);
        const res = await api.post<{ urls: string[] }>('/uploads/images', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        proofPhotoUrl = res.data.urls[0];
      }
      await api.post(`/job-orders/${jobOrderId}/payments`, {
        amount: Number(amount),
        method,
        referenceNo: referenceNo || undefined,
        proofPhotoUrl,
        paidAt: new Date(paidAt).toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-order-payments', jobOrderId] });
      setShowForm(false);
      setAmount('');
      setReferenceNo('');
      setPhotoFile(null);
    },
  });

  const voidMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/void`, { reason: voidReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-order-payments', jobOrderId] });
      setVoidingId(null);
      setVoidReason('');
    },
  });

  if (paymentsQuery.isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading payments…</p>;
  if (!paymentsQuery.data) return null;
  const { grandTotal, totalPaid, balance, payments } = paymentsQuery.data;

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700 }}>Payments</div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Record Payment'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem' }}>
        <div>Grand Total: <strong>{peso(grandTotal)}</strong></div>
        <div>Total Paid: <strong>{peso(totalPaid)}</strong></div>
        <div style={{ color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
          Balance: <strong>{peso(balance)}</strong>
        </div>
      </div>

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <input className="input" type="number" min="0.01" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <input className="input" placeholder="Reference # (optional)" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          <input className="input" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!amount || Number(amount) <= 0 || recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isPending ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Method</th>
            <th style={{ textAlign: 'right', padding: '0.3rem 0' }}>Amount</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Reference</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Proof</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: p.voidedAt ? 0.5 : 1 }}>
              <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
              <td>{p.method.replace('_', ' ')}</td>
              <td style={{ textAlign: 'right' }}>{p.voidedAt ? <s>{peso(Number(p.amount))}</s> : peso(Number(p.amount))}</td>
              <td>{p.referenceNo ?? '—'}</td>
              <td>{p.proofPhotoUrl ? <a href={fileUrl(p.proofPhotoUrl)} target="_blank" rel="noreferrer">View</a> : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {p.voidedAt ? (
                  <span style={{ color: 'var(--text-muted)' }}>Voided: {p.voidReason}</span>
                ) : canVoid ? (
                  voidingId === p.id ? (
                    <span style={{ display: 'flex', gap: '0.4rem' }}>
                      <input className="input" placeholder="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem' }} />
                      <button type="button" className="btn btn-secondary" disabled={!voidReason || voidMutation.isPending} onClick={() => voidMutation.mutate(p.id)}>
                        Confirm
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => setVoidingId(p.id)}>
                      Void
                    </button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments recorded yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Embed the panel in `JobOrderPage.tsx`**

In `admin-web/src/pages/JobOrderPage.tsx`, add the import near the other local imports (top of file, alongside existing `import` statements):

```typescript
import { JobOrderPayments } from '../components/JobOrderPayments';
```

Also import the current user role to gate the void button — check the top of the file for how the authenticated user is obtained (it uses `useAuthStore` in `AdminLayout.tsx`); add:

```typescript
import { useAuthStore } from '../lib/auth-store';
```

Inside `JobOrderPage()`, near the other hooks (after the `jobOrderQuery` declaration, ~line 269), add:

```typescript
  const role = useAuthStore((s) => s.user?.role);
```

Then render the panel right after the closing `</div>` of the header block (after line 607's `</div>` that closes the title `<div>`, i.e. right before the `<div style={{ display: 'flex', gap: '0.5rem', ...}}>` action buttons block ends at line ~650 — insert **after the whole header flex container closes**, so it appears below the header and above the items table). Locate the end of the header `<div>` that started at line 593 (`{/* Header */}`) and insert immediately after its closing `</div>`:

```tsx
        {jo?.id && (
          <JobOrderPayments jobOrderId={jo.id} canVoid={role === 'SUPER_ADMIN' || role === 'ADMIN_STAFF'} />
        )}
```

This only renders once the Job Order has been saved (`jo?.id` truthy) — a brand-new unsaved JO shows no payments panel, matching "record payments after the JO exists."

- [ ] **Step 4: Manual verification**

Run `npm run dev` (or the existing dev server), open a saved Job Order at `/job-orders/software`, click into one. Confirm:
- The Payments panel appears below the header with Grand Total/Total Paid/Balance all showing `₱0.00` / the JO's grand total on a fresh JO.
- Click "Record Payment", fill amount/method, save — the table updates and Balance decreases.
- As SUPER_ADMIN or ADMIN_STAFF, a "Void" button appears on an active row; voiding requires a reason and strikes through the amount, restoring the balance.
- Log in as SALES_STAFF (or temporarily check role logic) — confirm the Void button does not render for that role.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/components/JobOrderPayments.tsx admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): add payments panel to Job Order detail page"
```

---

### Task 7: Admin-web — Financial Reports page

**Files:**
- Modify: `admin-web/src/lib/types.ts`
- Create: `admin-web/src/pages/FinancialReportsPage.tsx`
- Modify: `admin-web/src/layouts/AdminLayout.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /reports/financial/collections`, `GET /reports/financial/outstanding`, `GET /reports/financial/client/:clientId`, `GET /reports/financial/export` (Task 5); `Client` type (existing); `ChartCard`, `SimpleBarChart` (existing, `admin-web/src/components/`).
- Produces: route `/financial-reports`.

- [ ] **Step 1: Add report types**

In `admin-web/src/lib/types.ts`, add after the types from Task 6:

```typescript
export interface CollectionsSummary {
  from: string | null;
  to: string | null;
  totalCollected: number;
  byMethod: { method: PaymentMethod; total: number; count: number }[];
}

export interface OutstandingRow {
  jobOrderId: string;
  clientId: string;
  clientName: string;
  grandTotal: number;
  totalPaid: number;
  balance: number;
  lastPaymentAt: string | null;
}

export interface ClientPaymentHistory {
  clientId: string;
  clientName: string;
  payments: (Payment & { jobOrderId: string })[];
}
```

- [ ] **Step 2: Create the page**

Create `admin-web/src/pages/FinancialReportsPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ChartCard } from '../components/ChartCard';
import { SimpleBarChart } from '../components/SimpleChart';
import type { Client, ClientPaymentHistory, CollectionsSummary, OutstandingRow } from '../lib/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
type Tab = 'collections' | 'outstanding' | 'client';

async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export function FinancialReportsPage() {
  const [tab, setTab] = useState<Tab>('collections');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState('');

  const collectionsQuery = useQuery({
    queryKey: ['financial-collections', from, to],
    queryFn: async () => (await api.get<CollectionsSummary>('/reports/financial/collections', { params: { from: from || undefined, to: to || undefined } })).data,
    enabled: tab === 'collections',
  });

  const outstandingQuery = useQuery({
    queryKey: ['financial-outstanding'],
    queryFn: async () => (await api.get<OutstandingRow[]>('/reports/financial/outstanding')).data,
    enabled: tab === 'outstanding',
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'SOFTWARE'],
    queryFn: async () => (await api.get<Client[]>('/clients', { params: { type: 'SOFTWARE' } })).data,
    enabled: tab === 'client',
  });

  const clientHistoryQuery = useQuery({
    queryKey: ['financial-client-history', clientId],
    queryFn: async () => (await api.get<ClientPaymentHistory>(`/reports/financial/client/${clientId}`)).data,
    enabled: tab === 'client' && !!clientId,
  });

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Financial Reports</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['collections', 'outstanding', 'client'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab(t)}>
            {t === 'collections' ? 'Collections' : t === 'outstanding' ? 'Outstanding' : 'Client History'}
          </button>
        ))}
      </div>

      {tab === 'collections' && (
        <ChartCard title="Collections Summary" subtitle="Total collected by payment method">
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(`/reports/financial/export?type=collections&from=${from}&to=${to}`, 'collections.csv')}>
              Export CSV
            </button>
          </div>
          {collectionsQuery.data && (
            <>
              <div style={{ marginBottom: '1rem', fontWeight: 700 }}>Total Collected: {peso(collectionsQuery.data.totalCollected)}</div>
              <SimpleBarChart data={collectionsQuery.data.byMethod.map((m) => ({ label: m.method.replace('_', ' '), value: m.total }))} />
            </>
          )}
        </ChartCard>
      )}

      {tab === 'outstanding' && (
        <ChartCard title="Outstanding Balances" subtitle="Job Orders not yet fully paid">
          <div style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => downloadCsv('/reports/financial/export?type=outstanding', 'outstanding.csv')}>
              Export CSV
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Client</th>
                <th style={{ textAlign: 'right' }}>Grand Total</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th style={{ textAlign: 'left' }}>Last Payment</th>
              </tr>
            </thead>
            <tbody>
              {(outstandingQuery.data ?? []).map((row) => (
                <tr key={row.jobOrderId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.3rem 0' }}>{row.clientName}</td>
                  <td style={{ textAlign: 'right' }}>{peso(row.grandTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{peso(row.totalPaid)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{peso(row.balance)}</td>
                  <td>{row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {(outstandingQuery.data ?? []).length === 0 && (
                <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No outstanding balances.</td></tr>
              )}
            </tbody>
          </table>
        </ChartCard>
      )}

      {tab === 'client' && (
        <ChartCard title="Client Payment History">
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <option value="">Select a client…</option>
            {(clientsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
          </select>
          {clientHistoryQuery.data && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'left' }}>Job Order</th>
                </tr>
              </thead>
              <tbody>
                {clientHistoryQuery.data.payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>{p.method.replace('_', ' ')}</td>
                    <td style={{ textAlign: 'right' }}>{peso(Number(p.amount))}</td>
                    <td>JO-{p.jobOrderId.slice(0, 8).toUpperCase()}</td>
                  </tr>
                ))}
                {clientHistoryQuery.data.payments.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments for this client.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </ChartCard>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add navigation**

In `admin-web/src/layouts/AdminLayout.tsx`, add a `Receipt` icon import (line 13-34 lucide-react import block):

```typescript
  Receipt,
```

Add to `NAV_ICONS` (after `'/analytics': BarChart3,` at line 50):

```typescript
  '/financial-reports': Receipt,
```

Add the nav entry to `SUPER_ADMIN`, `ADMIN_STAFF`, and `SALES_STAFF` arrays in `NAV_ITEMS_BY_ROLE`. For `SUPER_ADMIN` (after `{ to: '/withdrawals', label: 'Withdrawals', indent: true },` at line 69):

```typescript
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
```

For `ADMIN_STAFF` (after `{ to: '/withdrawals', label: 'Withdrawals', indent: true },` at line 115):

```typescript
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
```

For `SALES_STAFF` (after `{ to: '/withdrawals', label: 'Withdrawals', indent: true },` at line 127):

```typescript
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
```

- [ ] **Step 4: Add the route**

In `admin-web/src/App.tsx`, add the import near the other page imports:

```typescript
import { FinancialReportsPage } from './pages/FinancialReportsPage';
```

Add the route after the `/job-orders/:jobId` route (after line 82's closing `/>`):

```tsx
        <Route
          path="/financial-reports"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF', 'SALES_STAFF']}>
              <FinancialReportsPage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 5: Manual verification**

With the dev server running, log in as SUPER_ADMIN, confirm "Financial Reports" appears under a new "Finance" section in the sidebar. Click through all three tabs: Collections shows the bar chart and a working date filter + CSV download; Outstanding lists JOs with balance > 0 (record a partial payment on one first if the list is empty) with a working CSV download; Client History lets you pick a client and see their payment timeline. Confirm SALES_STAFF and ADMIN_STAFF logins also see the menu and can load all three tabs.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/FinancialReportsPage.tsx admin-web/src/layouts/AdminLayout.tsx admin-web/src/App.tsx
git commit -m "feat(admin-web): add Financial Reports page (collections, outstanding, client history)"
```

---

### Task 8: Mobile — SALES_STAFF admin access + tappable Job Orders list

**Files:**
- Modify: `mobile/app/admin/_layout.tsx`
- Modify: `mobile/app/admin/job-orders.tsx`
- Modify: `mobile/src/types.ts`

**Interfaces:**
- Produces: `SALES_STAFF` passes the `isAdmin` gate; tapping a Job Order card navigates to `/admin/job-orders/[id]` (built in Task 9).

- [ ] **Step 1: Extend the role gate**

In `mobile/app/admin/_layout.tsx`, change line 9:

```typescript
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF';
```

to:

```typescript
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF' || user.role === 'SALES_STAFF';
```

Register the new detail screen in the same file's `<Stack>` (after `<Stack.Screen name="job-orders" options={{ title: 'Job Orders' }} />` at line 23):

```tsx
      <Stack.Screen name="job-orders/[id]" options={{ title: 'Job Order Payment' }} />
```

- [ ] **Step 2: Add payment types**

The detail screen in Task 9 gets `grandTotal`/`totalPaid`/`balance` pre-computed from
`GET /job-orders/:id/payments`, so the existing `JobOrder` interface in
`mobile/src/types.ts` (lines 117-125) does not need new fields — leave it as-is. Add the
new payment types after it:

```typescript
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'GCASH' | 'CHECK';

export interface Payment {
  id: string;
  jobOrderId: string;
  amount: string;
  method: PaymentMethod;
  referenceNo: string | null;
  proofPhotoUrl: string | null;
  paidAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface JobOrderPaymentsResponse {
  grandTotal: number;
  totalPaid: number;
  balance: number;
  payments: Payment[];
}
```

- [ ] **Step 3: Make the list tappable**

Replace the full contents of `mobile/app/admin/job-orders.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { JobOrder } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280', FINALIZED: '#2563eb', ON_GOING: '#d97706', COMPLETED: '#16a34a', CANCELLED: '#dc2626',
};

export default function JobOrdersScreen() {
  return (
    <AdminList<JobOrder>
      url="/job-orders"
      keyExtractor={(j) => j.id}
      emptyText="No job orders yet."
      renderItem={(j) => (
        <Pressable onPress={() => router.push(`/admin/job-orders/${j.id}`)}>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.title} numberOfLines={1}>{j.client?.businessName ?? 'Client'}</Text>
              <View style={[s.badge, { backgroundColor: STATUS_COLOR[j.status] ?? '#6b7280' }]}>
                <Text style={s.badgeText}>{j.status}</Text>
              </View>
            </View>
            <Text style={s.meta}>{j.type} · {j.product?.productName ?? 'Custom'}</Text>
            <View style={s.row}>
              <Text style={s.meta}>{new Date(j.createdAt).toLocaleDateString()}</Text>
              <Text style={[s.title, { color: '#4f46e5' }]}>{peso(Number(j.salePrice))}</Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}
```

- [ ] **Step 4: Manual verification**

Start Expo (`npx expo start --lan` in `mobile/`), log in on a SALES_STAFF test account, confirm the admin section (bottom/top nav or wherever it's entered from) is now reachable — previously it redirected to `/(tabs)`. Open Job Orders, confirm the list still renders and each card is tappable (it will 404/error until Task 9 adds the destination screen — expected at this point).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/admin/_layout.tsx mobile/app/admin/job-orders.tsx mobile/src/types.ts
git commit -m "feat(mobile): grant SALES_STAFF admin access; make Job Orders list tappable"
```

---

### Task 9: Mobile — Job Order payment detail screen

**Files:**
- Create: `mobile/app/admin/job-orders/[id].tsx`

**Interfaces:**
- Consumes: `GET /job-orders/:id` (existing), `GET /job-orders/:id/payments`, `POST /job-orders/:id/payments`, `POST /payments/:id/void`, `POST /uploads/images` (existing) — from Task 4/6.

- [ ] **Step 1: Create the screen**

Create `mobile/app/admin/job-orders/[id].tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, fileUrl } from '@/api';
import { useAuth } from '@/auth';
import { cardStyles as s } from '@/AdminList';
import type { JobOrder, JobOrderPaymentsResponse, PaymentMethod } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK'];

export default function JobOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const canVoid = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';

  const [jobOrder, setJobOrder] = useState<JobOrder | null>(null);
  const [data, setData] = useState<JobOrderPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [joRes, paymentsRes] = await Promise.all([
        api.get<JobOrder>(`/job-orders/${id}`),
        api.get<JobOrderPaymentsResponse>(`/job-orders/${id}/payments`),
      ]);
      setJobOrder(joRes.data);
      setData(paymentsRes.data);
    } catch {
      Alert.alert('Error', 'Could not load this job order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to attach proof.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const savePayment = async () => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Amount required', 'Enter a valid payment amount.');
      return;
    }
    setSaving(true);
    try {
      let proofPhotoUrl: string | undefined;
      if (photoUri) {
        const form = new FormData();
        form.append('files', { uri: photoUri, name: `payment-${Date.now()}.jpg`, type: 'image/jpeg' } as unknown as Blob);
        const { data: uploaded } = await api.post<{ urls: string[] }>('/uploads/images', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        proofPhotoUrl = uploaded.urls[0];
      }
      await api.post(`/job-orders/${id}/payments`, {
        amount: Number(amount),
        method,
        referenceNo: referenceNo || undefined,
        proofPhotoUrl,
        paidAt: new Date().toISOString(),
      });
      setAmount('');
      setReferenceNo('');
      setPhotoUri(null);
      setShowForm(false);
      await load();
      Alert.alert('Saved', 'Payment recorded.');
    } catch {
      Alert.alert('Error', 'Could not save the payment.');
    } finally {
      setSaving(false);
    }
  };

  const confirmVoid = async (paymentId: string) => {
    if (!voidReason.trim()) return;
    try {
      await api.post(`/payments/${paymentId}/void`, { reason: voidReason.trim() });
      setVoidingId(null);
      setVoidReason('');
      await load();
    } catch {
      Alert.alert('Error', 'Could not void the payment.');
    }
  };

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }
  if (!jobOrder || !data) {
    return <View style={{ padding: 16 }}><Text>Job order not found.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.card}>
        <Text style={s.title}>{jobOrder.client?.businessName ?? 'Client'}</Text>
        <Text style={s.meta}>{jobOrder.product?.productName ?? 'Custom'} · {jobOrder.status}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.meta}>Grand Total: <Text style={s.title}>{peso(data.grandTotal)}</Text></Text>
        <Text style={s.meta}>Total Paid: <Text style={s.title}>{peso(data.totalPaid)}</Text></Text>
        <Text style={s.meta}>Balance: <Text style={[s.title, { color: data.balance > 0 ? '#dc2626' : '#16a34a' }]}>{peso(data.balance)}</Text></Text>
      </View>

      <Pressable style={{ backgroundColor: '#4f46e5', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={() => setShowForm((v) => !v)}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Cancel' : 'Record Payment'}</Text>
      </Pressable>

      {showForm && (
        <View style={[s.card, { gap: 8 }]}>
          <TextInput style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }} keyboardType="numeric" placeholder="Amount" value={amount} onChangeText={setAmount} />
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {METHODS.map((m) => (
              <Pressable key={m} onPress={() => setMethod(m)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: method === m ? '#4f46e5' : '#eef0f4' }}>
                <Text style={{ color: method === m ? '#fff' : '#111827', fontSize: 12 }}>{m.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }} placeholder="Reference # (optional)" value={referenceNo} onChangeText={setReferenceNo} />
          <Pressable onPress={pickPhoto} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
            <Text>{photoUri ? 'Photo attached ✓' : 'Attach proof photo (optional)'}</Text>
          </Pressable>
          <Pressable disabled={saving} onPress={savePayment} style={{ backgroundColor: '#16a34a', borderRadius: 8, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save Payment'}</Text>
          </Pressable>
        </View>
      )}

      {data.payments.map((p) => (
        <View key={p.id} style={[s.card, { opacity: p.voidedAt ? 0.5 : 1 }]}>
          <View style={s.row}>
            <Text style={s.meta}>{new Date(p.paidAt).toLocaleDateString()} · {p.method.replace('_', ' ')}</Text>
            <Text style={s.title}>{p.voidedAt ? `~${peso(Number(p.amount))}~` : peso(Number(p.amount))}</Text>
          </View>
          {p.referenceNo && <Text style={s.meta}>Ref: {p.referenceNo}</Text>}
          {p.proofPhotoUrl && <Text style={s.meta}>Proof: {fileUrl(p.proofPhotoUrl)}</Text>}
          {p.voidedAt ? (
            <Text style={s.meta}>Voided: {p.voidReason}</Text>
          ) : canVoid ? (
            voidingId === p.id ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 13 }}
                  placeholder="Reason for voiding"
                  value={voidReason}
                  onChangeText={setVoidReason}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={!voidReason.trim()}
                    onPress={() => confirmVoid(p.id)}
                    style={{ backgroundColor: '#dc2626', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12 }}>Confirm Void</Text>
                  </Pressable>
                  <Pressable onPress={() => { setVoidingId(null); setVoidReason(''); }} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 12 }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setVoidingId(p.id)}><Text style={{ color: '#dc2626', fontSize: 12 }}>Void</Text></Pressable>
            )
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Manual verification**

With Expo running against the local backend, log in as SALES_STAFF, go to Job Orders, tap a card — confirm it opens this detail screen showing Grand Total/Paid/Balance. Record a payment with a camera-captured proof photo, confirm it appears in the list and the balance updates. Log in as ADMIN_STAFF, open the same Job Order, confirm the Void link appears on active payments and voiding it (with a reason) reverts the balance; confirm the Void link is absent for SALES_STAFF. Cross-check on admin-web (`JobOrderPage.tsx` panel from Task 6) that the same payment shows up there too — same backend endpoint, both clients should agree.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/admin/job-orders/[id].tsx
git commit -m "feat(mobile): Job Order payment detail screen (record + void)"
```

---

### Task 10: End-to-end verification pass

No new files — this task is a manual checklist confirming the whole feature works together before calling it done.

- [ ] **Step 1: Backend unit tests**

Run: `npx jest --no-coverage`
Expected: all suites pass, including the 9 pricing tests (Task 2) and 4 CSV tests (Task 3).

- [ ] **Step 2: Full-stack walkthrough on admin-web**

Open a Job Order with existing line items (materials) so `grandTotal` differs from a plain `salePrice − discount`. Record a downpayment, then a second installment payment with a different method. Confirm the running balance is correct after each. Void the first payment and confirm the balance goes back up by that amount. Open Financial Reports → Collections and confirm the total matches the sum of active (non-voided) payments you just made; check Outstanding lists this Job Order if balance > 0; check Client History shows the same payments under the right client. Download both CSVs and open them to confirm the numbers match what's on screen.

- [ ] **Step 3: Mobile walkthrough**

As SALES_STAFF on mobile (Expo Go, local backend), record a payment with a proof photo on the same Job Order used in Step 2. Refresh the admin-web panel and confirm the mobile-recorded payment appears there with the correct amount/method and a working proof-photo link.

- [ ] **Step 4: Role checks**

Confirm SALES_STAFF cannot void (button absent on both admin-web and mobile, and `POST /payments/:id/void` returns 403 if called directly with a SALES_STAFF token). Confirm INSTALLER/DEVELOPER/DESIGNER/LIAISON accounts cannot see the Financial Reports nav item on admin-web and get redirected out of `/admin` on mobile (unchanged — they were never added to the gate).

- [ ] **Step 5: Production build reminder**

Note (no action yet — this is a reminder for whoever ships the release): the mobile changes in Tasks 8-9 require a new EAS `production-apk` build before SALES_STAFF accounts see the new admin access or the payment screen on-device, same as prior mobile releases.
