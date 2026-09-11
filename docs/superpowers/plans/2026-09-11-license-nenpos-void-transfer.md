# License / NENPOS Void & Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SUPER_ADMIN securely void (soft-delete) a wrongly-entered `License` or `NenposClient` record, or transfer one's data into the other table, to fix data entered in the wrong tab.

**Architecture:** Two existing, unrelated Prisma tables (`License`, backing the "Bhagoh Licenses" tab, and `NenposClient`, backing the "NENPOS Clients" tab) each get `voidedAt`/`voidedById`/`voidReason` soft-delete columns plus a `transferredTo*Id` pointer. New password-gated NestJS endpoints perform the void/transfer; the existing global `AuditLogInterceptor` is extended to log them meaningfully. The admin-web `LicensesPage.tsx` gets new per-row actions and dialogs for both tabs, reusing a new shared confirmation-dialog component.

**Tech Stack:** NestJS 11 + Prisma 6 (MySQL) backend in `src/`; React 19 + TanStack Query + Vite admin panel in `admin-web/src/`; Jest for backend unit tests; no frontend test harness exists beyond pure-logic Vitest specs, so frontend tasks are verified manually.

## Global Constraints

- All new endpoints are `SUPER_ADMIN`-only (`@Roles(UserRole.SUPER_ADMIN)`), matching the existing sensitive actions on these controllers (`suspend`, `update`, `generate` on `LicensesController`).
- Password re-verification uses `bcrypt.compare` against the acting user's own `User.passwordHash`, duplicated inline in each service method — this mirrors the existing pattern in `src/reset.service.ts:158-165` and `src/payments.service.ts`; there is no shared `AuthService.verifyPassword` helper in this codebase, so one is not introduced.
- `confirmName` must match the target record's business/client name exactly after `.trim()` (case-sensitive) — no fuzzy matching.
- No existing enum (`LicenseStatus`, `ClientStatus`) is modified. No existing endpoint's behavior changes except `GET /licenses` and `GET /nenpos-clients`, which gain an opt-in `includeVoided` query param but keep their current default response shape otherwise.
- Follow the field-naming precedent already in this schema: `Payment` (`prisma/schema.prisma:489-508`) has the exact `voidedAt` / `voidReason` / `voidedById` / `voidedBy User? @relation(...)` shape being replicated here.
- No in-app restore/undo, no bulk transfer, no inline Client creation from the transfer flow — see the spec's "Non-goals" section (`docs/superpowers/specs/2026-09-11-license-nenpos-void-transfer-design.md`).
- The spec's testing section calls for "controller tests confirming SUPER_ADMIN-only" — this codebase has zero `*.controller.spec.ts` files anywhere (`@Roles`/`RolesGuard` behavior is exercised only manually / at the UI layer today), so no new pattern is introduced here either. Role-gating for the three new endpoints is instead verified manually as part of Tasks 7-10 (the buttons themselves are only rendered for `SUPER_ADMIN` in `admin-web`), consistent with how every other `SUPER_ADMIN`-only endpoint in this codebase (e.g. `suspend`, `generate`) is already verified.

---

## Task 1: Prisma schema — void/transfer columns

**Files:**
- Modify: `prisma/schema.prisma:162-176` (User relations block)
- Modify: `prisma/schema.prisma:248-273` (License model)
- Modify: `prisma/schema.prisma:755-771` (NenposClient model)
- Migration: `prisma/migrations/20260911000000_license_nenpos_void_transfer/migration.sql` (generated)

**Interfaces:**
- Produces: `License.voidedAt: Date | null`, `License.voidedById: string | null`, `License.voidReason: string | null`, `License.transferredToNenposClientId: string | null`; `NenposClient.voidedAt: Date | null`, `NenposClient.voidedById: string | null`, `NenposClient.voidReason: string | null`, `NenposClient.transferredToLicenseId: string | null`. Every later task's Prisma calls rely on these exact field names.

- [ ] **Step 1: Add the two new relation arrays to `User`**

In `prisma/schema.prisma`, find this block (line 172-173):

```prisma
  paymentsRecorded  Payment[]            @relation("PaymentRecordedBy")
  paymentsVoided    Payment[]            @relation("PaymentVoidedBy")
```

Add two lines directly after `paymentsVoided`:

```prisma
  paymentsRecorded  Payment[]            @relation("PaymentRecordedBy")
  paymentsVoided    Payment[]            @relation("PaymentVoidedBy")
  licensesVoided    License[]            @relation("LicenseVoidedBy")
  nenposClientsVoided NenposClient[]     @relation("NenposClientVoidedBy")
```

- [ ] **Step 2: Add the new columns and relation to `License`**

Find the `License` model (line 248-273). Replace:

```prisma
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  client      Client          @relation(fields: [clientId], references: [id])
  product     SoftwareProduct @relation(fields: [productId], references: [id])
  activatedBy User?           @relation("DeveloperActivations", fields: [activatedById], references: [id])
  jobs        Job[]

  @@map("licenses")
}
```

with:

```prisma
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Secure void / cross-tab transfer (see docs/superpowers/specs/2026-09-11-license-nenpos-void-transfer-design.md)
  voidedAt                    DateTime? @map("voided_at")
  voidedById                  String?   @map("voided_by_id")
  voidReason                  String?   @map("void_reason") @db.Text
  transferredToNenposClientId String?   @map("transferred_to_nenpos_client_id")

  client      Client          @relation(fields: [clientId], references: [id])
  product     SoftwareProduct @relation(fields: [productId], references: [id])
  activatedBy User?           @relation("DeveloperActivations", fields: [activatedById], references: [id])
  voidedBy    User?           @relation("LicenseVoidedBy", fields: [voidedById], references: [id])
  jobs        Job[]

  @@map("licenses")
}
```

- [ ] **Step 3: Add the new columns and relation to `NenposClient`**

Find the `NenposClient` model (line 755-771). Replace:

```prisma
model NenposClient {
  id         String    @id @default(uuid())
  clientId   String    @map("client_id")
  clientName String    @map("client_name")
  startDate  DateTime? @map("start_date")
  expiryDate DateTime? @map("expiry_date")
  license    String?
  status     String    @default("ACTIVE")
  installer  String?
  notes      String?   @db.Text
  address    String?   @db.Text

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("nenpos_clients")
}
```

with:

```prisma
model NenposClient {
  id         String    @id @default(uuid())
  clientId   String    @map("client_id")
  clientName String    @map("client_name")
  startDate  DateTime? @map("start_date")
  expiryDate DateTime? @map("expiry_date")
  license    String?
  status     String    @default("ACTIVE")
  installer  String?
  notes      String?   @db.Text
  address    String?   @db.Text

  // Secure void / cross-tab transfer (see docs/superpowers/specs/2026-09-11-license-nenpos-void-transfer-design.md)
  voidedAt               DateTime? @map("voided_at")
  voidedById             String?   @map("voided_by_id")
  voidReason             String?   @map("void_reason") @db.Text
  transferredToLicenseId String?   @map("transferred_to_license_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  voidedBy User? @relation("NenposClientVoidedBy", fields: [voidedById], references: [id])

  @@map("nenpos_clients")
}
```

- [ ] **Step 4: Generate and run the migration**

Run: `cd D:\beulah_monitoring_system && npx prisma migrate dev --name license_nenpos_void_transfer`
Expected: Output ends with `Your database is now in sync with your schema.` and a new folder `prisma/migrations/<timestamp>_license_nenpos_void_transfer/` is created containing `migration.sql` with four `ALTER TABLE` statements (two on `licenses`, two on `nenpos_clients`) adding the new nullable columns.

- [ ] **Step 5: Verify the Prisma client regenerated cleanly**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
feat(db): add void/transfer columns to License and NenposClient

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `LicensesService.voidLicense` + `findAll` filter

**Files:**
- Create: `src/void-license.dto.ts`
- Modify: `src/licenses.service.ts:1-16` (imports), `:94-99` (`findAll`), append new method after `update` (currently ends line 236)
- Modify: `src/licenses.controller.ts`
- Test: `src/licenses.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (already injected via `this.prisma` in `LicensesService`), `bcrypt.compare` from the `bcrypt` package (already a dependency, used in `src/reset.service.ts`).
- Produces: `LicensesService.findAll(includeVoided?: boolean): Promise<License[]>` (signature changes from no-arg), `LicensesService.voidLicense(id: string, userId: string, dto: VoidLicenseDto): Promise<License>` — later tasks (Task 3, Task 4) call these exact names.

- [ ] **Step 1: Create the DTO**

Write `src/void-license.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VoidLicenseDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  // Must exactly match the license's client.businessName, trimmed.
  @IsString()
  @IsNotEmpty()
  confirmName!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `src/licenses.service.spec.ts`, first extend the shared `buildService()` helper (lines 4-22) so the new tests and all existing tests keep passing. Replace:

```ts
function buildService() {
  const prisma = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    softwareProduct: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    license: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'lic-1', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const crypto = { signLicenseToken: jest.fn().mockReturnValue('signed-token') };
  const service = new LicensesService(prisma as never, crypto as never);
  return { service, prisma, crypto };
}
```

with:

```ts
import * as bcrypt from 'bcrypt';

function buildService() {
  const prisma: any = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    softwareProduct: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    license: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'lic-1', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ passwordHash: bcrypt.hashSync('correct-password', 4) }),
    },
    nenposClient: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'npc-1', ...data }),
      ),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const crypto = { signLicenseToken: jest.fn().mockReturnValue('signed-token') };
  const service = new LicensesService(prisma as never, crypto as never);
  return { service, prisma, crypto };
}
```

(The `import * as bcrypt from 'bcrypt';` goes at the top of the file alongside the existing `import { BadRequestException, ConflictException } from '@nestjs/common';` line.)

Then add this new `describe` block at the end of `src/licenses.service.spec.ts`:

```ts
describe('LicensesService.voidLicense', () => {
  function licenseWithClient(overrides: Partial<{ voidedAt: Date | null; businessName: string }> = {}) {
    return {
      id: 'lic-1',
      voidedAt: overrides.voidedAt ?? null,
      client: { businessName: overrides.businessName ?? 'Acme Corp' },
    };
  }

  it('voids the license when the password and confirmName both match', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue(licenseWithClient());

    await service.voidLicense('lic-1', 'user-1', {
      password: 'correct-password',
      confirmName: 'Acme Corp',
      reason: 'Entered in the wrong tab',
    } as never);

    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({
          voidedById: 'user-1',
          voidReason: 'Entered in the wrong tab',
        }),
      }),
    );
  });

  it('rejects an incorrect password without changing anything', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue(licenseWithClient());

    await expect(
      service.voidLicense('lic-1', 'user-1', {
        password: 'wrong-password',
        confirmName: 'Acme Corp',
      } as never),
    ).rejects.toThrow('Incorrect password');
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it('rejects a confirmName that does not match the business name', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue(licenseWithClient());

    await expect(
      service.voidLicense('lic-1', 'user-1', {
        password: 'correct-password',
        confirmName: 'Wrong Name',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it('rejects voiding an already-voided license', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue(licenseWithClient({ voidedAt: new Date() }));

    await expect(
      service.voidLicense('lic-1', 'user-1', {
        password: 'correct-password',
        confirmName: 'Acme Corp',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- licenses.service.spec.ts`
Expected: FAIL — `service.voidLicense is not a function`.

- [ ] **Step 4: Implement `findAll` filter and `voidLicense`**

In `src/licenses.service.ts`, update the imports (lines 1-16) — replace:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { UpdateLicenseDto } from './update-license.dto';
import { LicenseCryptoService } from './license-crypto.service';
import { generateTrialKey } from './trial-key.util';
```

with:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LicenseStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { UpdateLicenseDto } from './update-license.dto';
import { VoidLicenseDto } from './void-license.dto';
import { LicenseCryptoService } from './license-crypto.service';
import { generateTrialKey } from './trial-key.util';
```

Replace the existing `findAll` (lines 94-99):

```ts
  findAll() {
    return this.prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true, product: true },
    });
  }
```

with:

```ts
  findAll(includeVoided = false) {
    return this.prisma.license.findMany({
      where: includeVoided ? undefined : { voidedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { client: true, product: true },
    });
  }
```

Add this new method directly after `update` (after the closing `}` on line 236, before the `/** Daily sweep... */` comment on line 238):

```ts

  /**
   * Void a wrongly-entered license: soft-delete it after re-verifying the
   * admin's own login password and an exact re-typed client business name.
   */
  async voidLicense(id: string, userId: string, dto: VoidLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!license) throw new NotFoundException(`License ${id} not found`);
    if (license.voidedAt) {
      throw new BadRequestException('This license was already voided or transferred.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    if (dto.confirmName.trim() !== license.client.businessName.trim()) {
      throw new BadRequestException("The typed name doesn't match this license's client name.");
    }

    return this.prisma.license.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidedById: userId,
        voidReason: dto.reason ?? null,
      },
      include: { client: true, product: true },
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- licenses.service.spec.ts`
Expected: PASS — all tests including the pre-existing `generate`/`activate`/`daysBetween` describe blocks.

- [ ] **Step 6: Add the controller endpoint**

In `src/licenses.controller.ts`, replace:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from './authenticated-user.type';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { UpdateLicenseDto } from './update-license.dto';
import { LicensesService } from './licenses.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  generate(@Body() dto: GenerateLicenseDto) {
    return this.licensesService.generate(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.DEVELOPER)
  @Get()
  findAll() {
    return this.licensesService.findAll();
  }
```

with:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from './authenticated-user.type';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { UpdateLicenseDto } from './update-license.dto';
import { VoidLicenseDto } from './void-license.dto';
import { LicensesService } from './licenses.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  generate(@Body() dto: GenerateLicenseDto) {
    return this.licensesService.generate(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.DEVELOPER)
  @Get()
  findAll(@Query('includeVoided') includeVoided?: string) {
    return this.licensesService.findAll(includeVoided === 'true');
  }
```

Then add this new endpoint at the end of the class, directly after the `update` method (after its closing `}`, before the final `}` of the class):

```ts

  /** Soft-delete a wrongly-entered license after password + client-name re-confirmation. */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/void')
  voidLicense(
    @Param('id') id: string,
    @Body() dto: VoidLicenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.licensesService.voidLicense(id, user.id, dto);
  }
```

- [ ] **Step 7: Build to catch type errors**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/void-license.dto.ts src/licenses.service.ts src/licenses.controller.ts src/licenses.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(licenses): add password-gated void action and includeVoided filter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `LicensesService.transferToNenpos`

**Files:**
- Create: `src/transfer-license-to-nenpos.dto.ts`
- Modify: `src/licenses.service.ts` (append method), `src/licenses.controller.ts` (append endpoint)
- Test: `src/licenses.service.spec.ts`

**Interfaces:**
- Consumes: `LicensesService.voidLicense`'s password/confirmName pattern (Task 2); `this.prisma.$transaction` and `this.prisma.nenposClient.create` (both already present in the test mock built in Task 2, Step 2).
- Produces: `LicensesService.transferToNenpos(id: string, userId: string, dto: TransferLicenseToNenposDto): Promise<{ license: License; nenposClient: NenposClient }>` — no later task depends on this signature.

- [ ] **Step 1: Create the DTO**

Write `src/transfer-license-to-nenpos.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferLicenseToNenposDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  // Must exactly match the license's client.businessName, trimmed.
  @IsString()
  @IsNotEmpty()
  confirmName!: string;

  @IsOptional()
  @IsString()
  installer?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `src/licenses.service.spec.ts`:

```ts
describe('LicensesService.transferToNenpos', () => {
  function activatedLicenseWithClient() {
    return {
      id: 'lic-1',
      voidedAt: null,
      licenseKey: 'ABCD-1234',
      status: 'ACTIVATED',
      activationDate: new Date('2026-01-01'),
      expirationDate: new Date('2027-01-01'),
      client: { businessName: 'Acme Corp', clientCode: 'CLI-001', address: '123 Main St' },
    };
  }

  it('creates a NenposClient row and voids the source license with a link to it', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue(activatedLicenseWithClient());

    const result = await service.transferToNenpos('lic-1', 'user-1', {
      password: 'correct-password',
      confirmName: 'Acme Corp',
      installer: 'Juan',
      notes: 'Wrong tab originally',
    } as never);

    expect(prisma.nenposClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'CLI-001',
          clientName: 'Acme Corp',
          license: 'ABCD-1234',
          installer: 'Juan',
          notes: 'Wrong tab originally',
          address: '123 Main St',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({
          voidedById: 'user-1',
          transferredToNenposClientId: 'npc-1',
        }),
      }),
    );
    expect(result.nenposClient.id).toBe('npc-1');
    expect(result.license.transferredToNenposClientId).toBe('npc-1');
  });

  it('maps an EXPIRED license to NENPOS status EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({ ...activatedLicenseWithClient(), status: 'EXPIRED' });

    await service.transferToNenpos('lic-1', 'user-1', {
      password: 'correct-password',
      confirmName: 'Acme Corp',
    } as never);

    expect(prisma.nenposClient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
  });

  it('rejects transferring an already-voided license', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({ ...activatedLicenseWithClient(), voidedAt: new Date() });

    await expect(
      service.transferToNenpos('lic-1', 'user-1', {
        password: 'correct-password',
        confirmName: 'Acme Corp',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.nenposClient.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- licenses.service.spec.ts`
Expected: FAIL — `service.transferToNenpos is not a function`.

- [ ] **Step 4: Implement `transferToNenpos`**

Add this method to `src/licenses.service.ts` directly after `voidLicense` (added in Task 2), and add the import for the new DTO next to the `VoidLicenseDto` import:

```ts
import { TransferLicenseToNenposDto } from './transfer-license-to-nenpos.dto';
```

```ts

  /**
   * Move a license's data into the NENPOS Clients table (for a client that was
   * entered on the wrong tab), voiding the source license and linking to the
   * new NenposClient row.
   */
  async transferToNenpos(id: string, userId: string, dto: TransferLicenseToNenposDto) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!license) throw new NotFoundException(`License ${id} not found`);
    if (license.voidedAt) {
      throw new BadRequestException('This license was already voided or transferred.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    if (dto.confirmName.trim() !== license.client.businessName.trim()) {
      throw new BadRequestException("The typed name doesn't match this license's client name.");
    }

    const nenposStatus = license.status === LicenseStatus.EXPIRED ? 'EXPIRED' : 'ACTIVE';

    return this.prisma.$transaction(async (tx) => {
      const nenposClient = await tx.nenposClient.create({
        data: {
          clientId: license.client.clientCode,
          clientName: license.client.businessName,
          startDate: license.activationDate,
          expiryDate: license.expirationDate,
          license: license.licenseKey,
          status: nenposStatus,
          installer: dto.installer?.trim() || null,
          notes: dto.notes?.trim() || null,
          address: license.client.address,
        },
      });

      const updatedLicense = await tx.license.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedById: userId,
          transferredToNenposClientId: nenposClient.id,
        },
        include: { client: true, product: true },
      });

      return { license: updatedLicense, nenposClient };
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- licenses.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the controller endpoint**

In `src/licenses.controller.ts`, add the import next to `VoidLicenseDto`:

```ts
import { TransferLicenseToNenposDto } from './transfer-license-to-nenpos.dto';
```

Add this endpoint directly after the `voidLicense` endpoint added in Task 2:

```ts

  /** Move this license's data into the NENPOS Clients table, voiding the source. */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/transfer-to-nenpos')
  transferToNenpos(
    @Param('id') id: string,
    @Body() dto: TransferLicenseToNenposDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.licensesService.transferToNenpos(id, user.id, dto);
  }
```

- [ ] **Step 7: Build to catch type errors**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/transfer-license-to-nenpos.dto.ts src/licenses.service.ts src/licenses.controller.ts src/licenses.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(licenses): add transfer-to-NENPOS action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `NenposClientsService.voidClient` + `findAll` filter

**Files:**
- Create: `src/void-nenpos-client.dto.ts`
- Modify: `src/nenpos-clients.service.ts:1-6` (imports), `:53-57` (`findAll`), append new method after `delete` (line 132)
- Modify: `src/nenpos-clients.controller.ts`
- Test: `src/nenpos-clients.service.spec.ts` (new file)

**Interfaces:**
- Produces: `NenposClientsService.findAll(includeVoided?: boolean): Promise<NenposClient[]>`, `NenposClientsService.voidClient(id: string, userId: string, dto: VoidNenposClientDto): Promise<NenposClient>`.

- [ ] **Step 1: Create the DTO**

Write `src/void-nenpos-client.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VoidNenposClientDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  // Must exactly match the record's clientName, trimmed.
  @IsString()
  @IsNotEmpty()
  confirmName!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // Set only by the admin-web "Transfer to Bhagoh License" flow after it has
  // already created the destination License — links this void to it.
  @IsOptional()
  @IsString()
  transferredToLicenseId?: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/nenpos-clients.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { NenposClientsService } from './nenpos-clients.service';

function buildService() {
  const prisma: any = {
    nenposClient: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ passwordHash: bcrypt.hashSync('correct-password', 4) }),
    },
  };
  const service = new NenposClientsService(prisma as never);
  return { service, prisma };
}

describe('NenposClientsService.voidClient', () => {
  function record(overrides: Partial<{ voidedAt: Date | null; clientName: string }> = {}) {
    return {
      id: 'npc-1',
      voidedAt: overrides.voidedAt ?? null,
      clientName: overrides.clientName ?? 'Juan Store',
    };
  }

  it('voids the record when the password and confirmName both match', async () => {
    const { service, prisma } = buildService();
    prisma.nenposClient.findUnique.mockResolvedValue(record());

    await service.voidClient('npc-1', 'user-1', {
      password: 'correct-password',
      confirmName: 'Juan Store',
      reason: 'Duplicate entry',
    } as never);

    expect(prisma.nenposClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'npc-1' },
        data: expect.objectContaining({ voidedById: 'user-1', voidReason: 'Duplicate entry' }),
      }),
    );
  });

  it('records transferredToLicenseId when provided', async () => {
    const { service, prisma } = buildService();
    prisma.nenposClient.findUnique.mockResolvedValue(record());

    await service.voidClient('npc-1', 'user-1', {
      password: 'correct-password',
      confirmName: 'Juan Store',
      transferredToLicenseId: 'lic-9',
    } as never);

    expect(prisma.nenposClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ transferredToLicenseId: 'lic-9' }) }),
    );
  });

  it('rejects an incorrect password', async () => {
    const { service, prisma } = buildService();
    prisma.nenposClient.findUnique.mockResolvedValue(record());

    await expect(
      service.voidClient('npc-1', 'user-1', {
        password: 'wrong-password',
        confirmName: 'Juan Store',
      } as never),
    ).rejects.toThrow('Incorrect password');
  });

  it('rejects a confirmName mismatch', async () => {
    const { service, prisma } = buildService();
    prisma.nenposClient.findUnique.mockResolvedValue(record());

    await expect(
      service.voidClient('npc-1', 'user-1', {
        password: 'correct-password',
        confirmName: 'Wrong Name',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects voiding an already-voided record', async () => {
    const { service, prisma } = buildService();
    prisma.nenposClient.findUnique.mockResolvedValue(record({ voidedAt: new Date() }));

    await expect(
      service.voidClient('npc-1', 'user-1', {
        password: 'correct-password',
        confirmName: 'Juan Store',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException for a missing record', async () => {
    const { service } = buildService();
    await expect(
      service.voidClient('missing', 'user-1', {
        password: 'correct-password',
        confirmName: 'Juan Store',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- nenpos-clients.service.spec.ts`
Expected: FAIL — `service.voidClient is not a function`.

- [ ] **Step 4: Implement `findAll` filter and `voidClient`**

In `src/nenpos-clients.service.ts`, replace the import line:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { read, utils } from 'xlsx';
import { PrismaService } from './prisma.service';
import { CreateNenposClientDto } from './create-nenpos-client.dto';
import { UpdateNenposClientDto } from './update-nenpos-client.dto';
```

with:

```ts
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { read, utils } from 'xlsx';
import { PrismaService } from './prisma.service';
import { CreateNenposClientDto } from './create-nenpos-client.dto';
import { UpdateNenposClientDto } from './update-nenpos-client.dto';
import { VoidNenposClientDto } from './void-nenpos-client.dto';
```

Replace `findAll` (lines 53-57):

```ts
  findAll() {
    return this.prisma.nenposClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
```

with:

```ts
  findAll(includeVoided = false) {
    return this.prisma.nenposClient.findMany({
      where: includeVoided ? undefined : { voidedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
```

Add this new method directly after `delete` (line 132, before `deleteAll`):

```ts

  /**
   * Void a wrongly-entered NENPOS client record after re-verifying the admin's
   * own login password and an exact re-typed client name. `transferredToLicenseId`
   * is set only when this void is the finishing step of a "Transfer to Bhagoh
   * License" action in the admin panel.
   */
  async voidClient(id: string, userId: string, dto: VoidNenposClientDto) {
    const existing = await this.prisma.nenposClient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`NENPOS client ${id} not found`);
    if (existing.voidedAt) {
      throw new BadRequestException('This record was already voided or transferred.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    if (dto.confirmName.trim() !== existing.clientName.trim()) {
      throw new BadRequestException("The typed name doesn't match this record's client name.");
    }

    return this.prisma.nenposClient.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidedById: userId,
        voidReason: dto.reason ?? null,
        transferredToLicenseId: dto.transferredToLicenseId ?? null,
      },
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- nenpos-clients.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the controller endpoint**

`src/nenpos-clients.service.ts` needs `PrismaService` injected — it already is (constructor at line 51 takes `private readonly prisma: PrismaService`), so no controller/module wiring change is needed there.

In `src/nenpos-clients.controller.ts`, replace the imports and `findAll`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
```

with:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
```

Add near the other DTO imports:

```ts
import { VoidNenposClientDto } from './void-nenpos-client.dto';
```

Also add, next to the existing imports:

```ts
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
```

Replace:

```ts
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll() {
    return this.service.findAll();
  }
```

with:

```ts
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll(@Query('includeVoided') includeVoided?: string) {
    return this.service.findAll(includeVoided === 'true');
  }
```

Add this new endpoint directly after the existing `delete` method (before `clearAll`):

```ts

  /** Soft-delete a wrongly-entered NENPOS client after password + name re-confirmation. */
  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/void')
  voidClient(
    @Param('id') id: string,
    @Body() dto: VoidNenposClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.voidClient(id, user.id, dto);
  }
```

- [ ] **Step 7: Build to catch type errors**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/void-nenpos-client.dto.ts src/nenpos-clients.service.ts src/nenpos-clients.controller.ts src/nenpos-clients.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(nenpos-clients): add password-gated void action and includeVoided filter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Audit-log action names for the new endpoints

**Files:**
- Modify: `src/audit-log.interceptor.ts:101-157`
- Test: `src/audit-log.interceptor.spec.ts` (new file)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the URL shapes `POST /api/licenses/:id/void`, `POST /api/licenses/:id/transfer-to-nenpos`, `POST /api/nenpos-clients/:id/void` established in Tasks 2-4.
- Produces: nothing consumed by later tasks — this is the last backend task.

- [ ] **Step 1: Write the failing test**

Create `src/audit-log.interceptor.spec.ts`:

```ts
import { AuditLogInterceptor } from './audit-log.interceptor';

function buildInterceptor() {
  const auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
  const eventsService = { emit: jest.fn() };
  const interceptor = new AuditLogInterceptor(auditLogsService as never, eventsService as never);
  return { interceptor, auditLogsService };
}

// deriveActionName is private; exercise it through the public logAction
// method (still on the class, just not part of its public contract), passing
// a minimal fake request object.
function fakeRequest(method: string, url: string, body: Record<string, unknown> = {}) {
  return { method, url, ip: '127.0.0.1', body, user: { id: 'user-1' }, get: () => 'test-agent' };
}

describe('AuditLogInterceptor action names', () => {
  it('logs "Voided License" for POST /api/licenses/:id/void', async () => {
    const { interceptor, auditLogsService } = buildInterceptor();
    await (interceptor as any).logAction(fakeRequest('POST', '/api/licenses/lic-1/void'), 'user-1', {});
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Voided License' }),
    );
  });

  it('logs "Transferred License to NENPOS" for POST /api/licenses/:id/transfer-to-nenpos', async () => {
    const { interceptor, auditLogsService } = buildInterceptor();
    await (interceptor as any).logAction(fakeRequest('POST', '/api/licenses/lic-1/transfer-to-nenpos'), 'user-1', {});
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Transferred License to NENPOS' }),
    );
  });

  it('logs "Voided NENPOS Client" for a plain void', async () => {
    const { interceptor, auditLogsService } = buildInterceptor();
    const request = fakeRequest('POST', '/api/nenpos-clients/npc-1/void', { password: 'x', confirmName: 'y' });
    await (interceptor as any).logAction(request, 'user-1', {});
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Voided NENPOS Client' }),
    );
  });

  it('logs "Transferred NENPOS Client to License" when transferredToLicenseId is in the body', async () => {
    const { interceptor, auditLogsService } = buildInterceptor();
    const request = fakeRequest('POST', '/api/nenpos-clients/npc-1/void', {
      password: 'x',
      confirmName: 'y',
      transferredToLicenseId: 'lic-9',
    });
    await (interceptor as any).logAction(request, 'user-1', {});
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Transferred NENPOS Client to License' }),
    );
  });

  it('still logs "Updated License" for the pre-existing PATCH /api/licenses/:id', async () => {
    const { interceptor, auditLogsService } = buildInterceptor();
    await (interceptor as any).logAction(fakeRequest('PATCH', '/api/licenses/lic-1'), 'user-1', {});
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Updated License' }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- audit-log.interceptor.spec.ts`
Expected: FAIL — the first four assertions get `'Created License'` / `'Created NENPOS Client'` instead (from the generic POST-fallback path).

- [ ] **Step 3: Implement the new action names**

In `src/audit-log.interceptor.ts`, replace:

```ts
    let action = this.deriveActionName(method, url);
    if (error) {
      action = `Failed ${action} (${error.status || error.code || 'Error'})`;
    }
```

with:

```ts
    let action = this.deriveActionName(method, url, body);
    if (error) {
      action = `Failed ${action} (${error.status || error.code || 'Error'})`;
    }
```

Then replace:

```ts
  private deriveActionName(method: string, url: string): string {
    if (url.includes('/auth/login')) return 'User Login';
    if (url.includes('/auth/logout')) return 'User Logout';
    if (url.includes('/auth/refresh')) return 'Token Refresh';
    if (url.includes('/pin-agreement')) {
      return method === 'DELETE' ? 'Unlocked Job Order Agreement' : 'Pinned Job Order Agreement';
    }

    const parts = url.split('/').filter(p => p && p !== 'api');
```

with:

```ts
  private deriveActionName(method: string, url: string, body?: Record<string, unknown>): string {
    if (url.includes('/auth/login')) return 'User Login';
    if (url.includes('/auth/logout')) return 'User Logout';
    if (url.includes('/auth/refresh')) return 'Token Refresh';
    if (url.includes('/pin-agreement')) {
      return method === 'DELETE' ? 'Unlocked Job Order Agreement' : 'Pinned Job Order Agreement';
    }
    if (url.includes('/transfer-to-nenpos')) return 'Transferred License to NENPOS';
    if (/\/licenses\/[^/]+\/void/.test(url)) return 'Voided License';
    if (/\/nenpos-clients\/[^/]+\/void/.test(url)) {
      return body?.transferredToLicenseId ? 'Transferred NENPOS Client to License' : 'Voided NENPOS Client';
    }

    const parts = url.split('/').filter(p => p && p !== 'api');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- audit-log.interceptor.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `npm test`
Expected: PASS — no regressions in any other `.spec.ts` file.

- [ ] **Step 6: Commit**

```bash
git add src/audit-log.interceptor.ts src/audit-log.interceptor.spec.ts
git commit -m "$(cat <<'EOF'
feat(audit-log): name the void/transfer actions instead of the generic fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend types + shared `VoidConfirmDialog`

**Files:**
- Modify: `admin-web/src/lib/types.ts:55-68` (`License`), `:345-358` (`NenposClient`)
- Create: `admin-web/src/components/VoidConfirmDialog.tsx`
- Modify: `admin-web/src/index.css` (badge colors)

**Interfaces:**
- Produces: `License.voidedAt/voidedById/voidReason/transferredToNenposClientId: string | null`; `NenposClient.voidedAt/voidedById/voidReason/transferredToLicenseId: string | null`; the `VoidConfirmDialog` component with props `{ isOpen, onClose, title, description?, expectedName, showReason?, submitLabel, isPending, error, onSubmit(input: { password: string; confirmName: string; reason: string }) }` — Tasks 7 and 8 both render this component with these exact prop names.

- [ ] **Step 1: Update `License` and `NenposClient` types**

In `admin-web/src/lib/types.ts`, replace:

```ts
export interface License {
  id: string;
  licenseKey: string;
  clientId: string;
  productId: string;
  activatedById: string | null;
  status: LicenseStatus;
  activationDate: string | null;
  expirationDate: string | null;
  isTrial: boolean;
  trialDays: number | null;
  client?: Client;
  product?: SoftwareProduct;
}
```

with:

```ts
export interface License {
  id: string;
  licenseKey: string;
  clientId: string;
  productId: string;
  activatedById: string | null;
  status: LicenseStatus;
  activationDate: string | null;
  expirationDate: string | null;
  isTrial: boolean;
  trialDays: number | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  transferredToNenposClientId: string | null;
  client?: Client;
  product?: SoftwareProduct;
}
```

Replace:

```ts
export interface NenposClient {
  id: string;
  clientId: string;
  clientName: string;
  startDate: string | null;
  expiryDate: string | null;
  license: string | null;
  status: string | null;
  installer: string | null;
  notes: string | null;
  address: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
}
```

with:

```ts
export interface NenposClient {
  id: string;
  clientId: string;
  clientName: string;
  startDate: string | null;
  expiryDate: string | null;
  license: string | null;
  status: string | null;
  installer: string | null;
  notes: string | null;
  address: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  transferredToLicenseId: string | null;
}
```

(`uploadedAt`/`uploadedBy` are pre-existing fields on this type that the backend never actually returns — leave them as-is; that mismatch predates this feature and is out of scope here.)

- [ ] **Step 2: Create the shared dialog component**

Write `admin-web/src/components/VoidConfirmDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';

interface VoidConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  /** The exact business/client name the admin must retype to proceed. */
  expectedName: string;
  showReason?: boolean;
  submitLabel: string;
  isPending: boolean;
  error?: string;
  onSubmit: (input: { password: string; confirmName: string; reason: string }) => void;
}

/**
 * Shared password + exact-name re-confirmation dialog used by both the
 * License "Void" action and the NENPOS Client "Void" action.
 */
export function VoidConfirmDialog({
  isOpen, onClose, title, description, expectedName,
  showReason = true, submitLabel, isPending, error, onSubmit,
}: VoidConfirmDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setConfirmName('');
      setReason('');
    }
  }, [isOpen]);

  const canSubmit = password.length > 0 && confirmName.trim() === expectedName.trim() && !isPending;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} maxWidth={480}>
      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit({ password, confirmName, reason }); }}>
        {description && <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{description}</div>}
        {showReason && (
          <div className="field">
            <label htmlFor="void-reason">Reason (optional)</label>
            <textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="void-password">Your login password</label>
          <input
            id="void-password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="void-confirm-name">
            Type <strong>{expectedName}</strong> to confirm
          </label>
          <input
            id="void-confirm-name" type="text" required
            value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            type="submit" className="btn btn-secondary"
            style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }}
            disabled={!canSubmit}
          >
            {isPending ? 'Working…' : submitLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add badge colors for voided/transferred rows**

In `admin-web/src/index.css`, find the `.badge-suspended, .badge-expired, .badge-cancelled, .badge-rejected` rule block (around line 344-350) and add a new rule directly after its closing `}`:

```css
.badge-voided {
  background: rgba(107, 114, 128, 0.1);
  color: var(--text-muted);
  border-color: rgba(107, 114, 128, 0.2);
}

.badge-transferred {
  background: var(--info-light);
  color: var(--info);
  border-color: var(--info-glow);
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev --prefix admin-web` and `npm run start:dev` (or `npm run dev` from the repo root, which runs both).
Expected: app builds and loads with no console errors (the new component isn't used anywhere yet, so this just confirms no TypeScript/build breakage).

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/components/VoidConfirmDialog.tsx admin-web/src/index.css
git commit -m "$(cat <<'EOF'
feat(admin-web): add void/transfer types and shared confirmation dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Bhagoh Licenses tab — Void action + Show voided toggle

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx`

**Interfaces:**
- Consumes: `VoidConfirmDialog` (Task 6), `License.voidedAt/voidReason/transferredToNenposClientId` (Task 6).
- Produces: `includeVoidedLicenses` state and `licensesQuery` refetch behavior that Task 8 (Transfer to NENPOS) also relies on for showing the resulting badge.

- [ ] **Step 1: Add state, the includeVoided-aware query, and the void mutation**

In `LicensesPage.tsx`, inside the `LicensesPage` component, replace:

```ts
  const [licSearch, setLicSearch] = useState('');
  const [licStatus, setLicStatus] = useState('');

  const licensesQuery = useQuery({
    queryKey: ['licenses'],
    queryFn: async () => (await api.get<License[]>('/licenses')).data,
  });
```

with:

```ts
  const [licSearch, setLicSearch] = useState('');
  const [licStatus, setLicStatus] = useState('');
  const [showVoidedLicenses, setShowVoidedLicenses] = useState(false);
  const [voidingLicense, setVoidingLicense] = useState<License | null>(null);
  const [voidLicenseError, setVoidLicenseError] = useState('');

  const licensesQuery = useQuery({
    queryKey: ['licenses', showVoidedLicenses],
    queryFn: async () =>
      (await api.get<License[]>('/licenses', { params: { includeVoided: showVoidedLicenses } })).data,
  });

  const voidLicenseMutation = useMutation({
    mutationFn: async (input: { password: string; confirmName: string; reason: string }) =>
      (await api.post<License>(`/licenses/${voidingLicense!.id}/void`, {
        password: input.password,
        confirmName: input.confirmName,
        reason: input.reason || undefined,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setVoidingLicense(null);
      setVoidLicenseError('');
    },
    onError: (err: any) => {
      setVoidLicenseError(err?.response?.data?.message ?? 'Could not void the license. Try again.');
    },
  });
```

- [ ] **Step 2: Import `VoidConfirmDialog`**

Add to the top imports:

```ts
import { VoidConfirmDialog } from '../components/VoidConfirmDialog';
```

- [ ] **Step 3: Render the toggle and the dialog, and add the row action**

Find the action bar block:

```tsx
          {/* Action bar */}
          {!isDeveloper && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                + Add License
              </button>
            </div>
          )}
```

Replace with:

```tsx
          {/* Action bar */}
          {!isDeveloper && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                + Add License
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={showVoidedLicenses} onChange={(e) => setShowVoidedLicenses(e.target.checked)} />
                Show voided/transferred
              </label>
            </div>
          )}

          <VoidConfirmDialog
            isOpen={!!voidingLicense}
            onClose={() => { setVoidingLicense(null); setVoidLicenseError(''); }}
            title="Void License"
            description="This hides the license from the active list. It is not permanently deleted."
            expectedName={voidingLicense?.client?.businessName ?? ''}
            submitLabel="Void License"
            isPending={voidLicenseMutation.isPending}
            error={voidLicenseError}
            onSubmit={(input) => voidLicenseMutation.mutate(input)}
          />
```

Now find the row's action `<td>` (inside `paginatedLicenses.map`):

```tsx
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                  {isDeveloper && license.status === 'PENDING' && (
                                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                      onClick={() => setActivatingId(license.id)}>
                                      Activate
                                    </button>
                                  )}
                                  {!isDeveloper && license.status === 'ACTIVATED' && (
                                    <button type="button" className="btn btn-secondary"
                                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                      disabled={suspendLicense.isPending}
                                      onClick={() => suspendLicense.mutate(license.id)}>
                                      Suspend
                                    </button>
                                  )}
                                  {!isDeveloper && (
                                    <button type="button" className="btn btn-secondary"
                                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                      onClick={() => openEdit(license)}>
                                      Edit
                                    </button>
                                  )}
                                  <button type="button" className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                    onClick={() => setViewLicense(license)}>
                                    View
                                  </button>
                                </div>
                              </td>
```

Replace with:

```tsx
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {license.voidedAt ? (
                                  <span className={`badge ${license.transferredToNenposClientId ? 'badge-transferred' : 'badge-voided'}`}>
                                    {license.transferredToNenposClientId ? 'Transferred to NENPOS' : 'Voided'}
                                  </span>
                                ) : (
                                  <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                    {isDeveloper && license.status === 'PENDING' && (
                                      <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                        onClick={() => setActivatingId(license.id)}>
                                        Activate
                                      </button>
                                    )}
                                    {!isDeveloper && license.status === 'ACTIVATED' && (
                                      <button type="button" className="btn btn-secondary"
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                        disabled={suspendLicense.isPending}
                                        onClick={() => suspendLicense.mutate(license.id)}>
                                        Suspend
                                      </button>
                                    )}
                                    {!isDeveloper && (
                                      <button type="button" className="btn btn-secondary"
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                        onClick={() => openEdit(license)}>
                                        Edit
                                      </button>
                                    )}
                                    <button type="button" className="btn btn-secondary"
                                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                      onClick={() => setViewLicense(license)}>
                                      View
                                    </button>
                                    {!isDeveloper && (
                                      <button type="button" className="btn btn-secondary"
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                        onClick={() => setVoidingLicense(license)}>
                                        Void
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
```

- [ ] **Step 4: Manual verification**

Run the app (`npm run dev` from repo root). Log in as `SUPER_ADMIN`. On the Bhagoh Licenses tab:
1. Click "Void" on a license, submit with the wrong password → expect "Incorrect password — nothing was changed"-style error and the license still active.
2. Submit with the correct password but wrong typed name → expect a name-mismatch error.
3. Submit with the correct password and exact business name → expect the row to disappear from the default list.
4. Check "Show voided/transferred" → expect the voided row to reappear, greyed with a "Voided" badge and no action buttons.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "$(cat <<'EOF'
feat(admin-web): add Void action to the Bhagoh Licenses tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Bhagoh Licenses tab — Transfer to NENPOS

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx`

**Interfaces:**
- Consumes: `POST /licenses/:id/transfer-to-nenpos` (Task 3); the `showVoidedLicenses`/`voidingLicense` state pattern from Task 7.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add state and mutation**

Directly after the `voidLicenseMutation` block added in Task 7, add:

```ts
  const [transferringLicense, setTransferringLicense] = useState<License | null>(null);
  const [transferInstaller, setTransferInstaller] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState('');

  const transferToNenposMutation = useMutation({
    mutationFn: async (input: { password: string; confirmName: string }) =>
      (await api.post(`/licenses/${transferringLicense!.id}/transfer-to-nenpos`, {
        password: input.password,
        confirmName: input.confirmName,
        installer: transferInstaller.trim() || undefined,
        notes: transferNotes.trim() || undefined,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setTransferringLicense(null);
      setTransferInstaller('');
      setTransferNotes('');
      setTransferError('');
    },
    onError: (err: any) => {
      setTransferError(err?.response?.data?.message ?? 'Could not transfer the license. Try again.');
    },
  });
```

- [ ] **Step 2: Render the Transfer dialog and row button**

Directly after the `<VoidConfirmDialog ... />` block added in Task 7, add a bespoke dialog (it needs the extra Installer/Notes fields that `VoidConfirmDialog` doesn't have, so it isn't reused as-is):

```tsx
          <Dialog
            isOpen={!!transferringLicense}
            onClose={() => { setTransferringLicense(null); setTransferError(''); }}
            title="Transfer to NENPOS"
            maxWidth={480}
          >
            {transferringLicense && (
              <form onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const password = (form.elements.namedItem('transfer-password') as HTMLInputElement).value;
                const confirmName = (form.elements.namedItem('transfer-confirm-name') as HTMLInputElement).value;
                transferToNenposMutation.mutate({ password, confirmName });
              }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Will be copied to NENPOS Clients:</div>
                  <div style={{ fontWeight: 600 }}>{transferringLicense.client?.businessName}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.4rem' }}>{transferringLicense.licenseKey}</div>
                </div>
                <div className="field">
                  <label htmlFor="transfer-installer">Installer (optional)</label>
                  <input id="transfer-installer" type="text" value={transferInstaller} onChange={(e) => setTransferInstaller(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="transfer-notes">Notes (optional)</label>
                  <textarea id="transfer-notes" rows={2} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="transfer-password">Your login password</label>
                  <input id="transfer-password" name="transfer-password" type="password" required autoComplete="current-password" />
                </div>
                <div className="field">
                  <label htmlFor="transfer-confirm-name">
                    Type <strong>{transferringLicense.client?.businessName}</strong> to confirm
                  </label>
                  <input id="transfer-confirm-name" name="transfer-confirm-name" type="text" required />
                </div>
                {transferError && <p className="error-text">{transferError}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={transferToNenposMutation.isPending} style={{ flex: 1 }}>
                    {transferToNenposMutation.isPending ? 'Transferring…' : 'Transfer to NENPOS'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setTransferringLicense(null); setTransferError(''); }}>Cancel</button>
                </div>
              </form>
            )}
          </Dialog>
```

Then add a "Transfer" button in the row actions, directly before the "Void" button added in Task 7:

```tsx
                                    {!isDeveloper && (
                                      <button type="button" className="btn btn-secondary"
                                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                        onClick={() => setTransferringLicense(license)}>
                                        Transfer
                                      </button>
                                    )}
```

(This form reads its password/confirm-name fields via `form.elements.namedItem(...)` rather than React state, matching this file's existing convention of using controlled state for most fields but keeping this one dialog's transient inputs local — since they're cleared entirely on close/success by unmounting, uncontrolled inputs are sufficient here and avoid four more `useState` calls for a rarely-used dialog.)

- [ ] **Step 3: Manual verification**

1. Click "Transfer" on an active license, fill in installer/notes, submit with correct password + exact business name.
2. Expect the license row to show a "Transferred to NENPOS" badge (with "Show voided/transferred" checked).
3. Switch to the NENPOS Clients tab and confirm a new row exists with the same business name, license key, and the installer/notes you entered.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "$(cat <<'EOF'
feat(admin-web): add Transfer-to-NENPOS action to the Bhagoh Licenses tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: NENPOS Clients tab — Void action + Show voided toggle

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx` (inside `NenposClientsTab`)

**Interfaces:**
- Consumes: `VoidConfirmDialog` (Task 6), `NenposClient.voidedAt/voidReason/transferredToLicenseId` (Task 6).
- Produces: `showVoidedNenpos` state that Task 10 does not need to touch (Task 10's dialog opens independently of this toggle).

- [ ] **Step 1: Add state, includeVoided-aware query, and void mutation**

Inside `NenposClientsTab`, replace:

```ts
  const listQuery = useQuery({
    queryKey: ['nenpos-clients'],
    queryFn: async () => (await api.get<NenposClient[]>('/nenpos-clients')).data,
  });
```

with:

```ts
  const [showVoided, setShowVoided] = useState(false);
  const [voidingRecord, setVoidingRecord] = useState<NenposClient | null>(null);
  const [voidError, setVoidError] = useState('');

  const listQuery = useQuery({
    queryKey: ['nenpos-clients', showVoided],
    queryFn: async () =>
      (await api.get<NenposClient[]>('/nenpos-clients', { params: { includeVoided: showVoided } })).data,
  });

  const voidMutation = useMutation({
    mutationFn: async (input: { password: string; confirmName: string; reason: string }) =>
      (await api.post<NenposClient>(`/nenpos-clients/${voidingRecord!.id}/void`, {
        password: input.password,
        confirmName: input.confirmName,
        reason: input.reason || undefined,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setVoidingRecord(null);
      setVoidError('');
    },
    onError: (err: any) => {
      setVoidError(err?.response?.data?.message ?? 'Could not void the record. Try again.');
    },
  });
```

- [ ] **Step 2: Import `VoidConfirmDialog`**

Add to the top imports of `LicensesPage.tsx` (if not already added by Task 7 — it will be, since both tabs live in this one file):

Already imported in Task 7; no change needed here.

- [ ] **Step 3: Render the toggle, dialog, and row action**

Find the action bar in `NenposClientsTab`:

```tsx
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => { setEditingId(null); setAddForm(EMPTY_NENPOS_FORM); setAddError(''); setShowAddForm(true); }}>
          + Add Client
        </button>
```

Add directly after the closing `</label>` of the file-upload `<label>` element (i.e., right before the action-bar `</div>` closes — find the closing of that div, which is:

```tsx
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadResult(null);
              setUploadError('');
              uploadMutation.mutate(file);
            }}
            disabled={uploadMutation.isPending}
          />
        </label>
      </div>
```

Replace with:

```tsx
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadResult(null);
              setUploadError('');
              uploadMutation.mutate(file);
            }}
            disabled={uploadMutation.isPending}
          />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          Show voided/transferred
        </label>
      </div>

      <VoidConfirmDialog
        isOpen={!!voidingRecord}
        onClose={() => { setVoidingRecord(null); setVoidError(''); }}
        title="Void NENPOS Client"
        description="This hides the record from the active list. It is not permanently deleted."
        expectedName={voidingRecord?.clientName ?? ''}
        submitLabel="Void Client"
        isPending={voidMutation.isPending}
        error={voidError}
        onSubmit={(input) => voidMutation.mutate(input)}
      />
```

Now find the row's action `<td>`:

```tsx
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                onClick={() => setViewRecord(row)}
                              >
                                View
                              </button>
                            </div>
                          </td>
```

Replace with:

```tsx
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {row.voidedAt ? (
                              <span className={`badge ${row.transferredToLicenseId ? 'badge-transferred' : 'badge-voided'}`}>
                                {row.transferredToLicenseId ? 'Transferred to Bhagoh' : 'Voided'}
                              </span>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                  onClick={() => openEdit(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                  onClick={() => setViewRecord(row)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                  onClick={() => setVoidingRecord(row)}
                                >
                                  Void
                                </button>
                              </div>
                            )}
                          </td>
```

- [ ] **Step 4: Manual verification**

Same checks as Task 7 Step 4, but on the NENPOS Clients tab, confirming against `clientName` instead of `businessName`.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "$(cat <<'EOF'
feat(admin-web): add Void action to the NENPOS Clients tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: NENPOS Clients tab — Transfer to Bhagoh License

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx`

**Interfaces:**
- Consumes: the existing "Add License" dialog and `generateLicense` mutation (already in `LicensesPage`, lines 649-667 and 774-856 before this plan's edits); `POST /nenpos-clients/:id/void` with `transferredToLicenseId` (Task 4).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Add transfer-source state to `LicensesPage`**

Directly after the `transferError` state added in Task 8, add:

```ts
  const [transferSourceNenpos, setTransferSourceNenpos] = useState<NenposClient | null>(null);
  const [nenposTransferPassword, setNenposTransferPassword] = useState('');
  const [nenposTransferConfirmName, setNenposTransferConfirmName] = useState('');
```

- [ ] **Step 2: Pre-fill the Add License form when opened as a transfer**

Add this function directly after `openEdit` (the one for licenses, ending around the original line 679):

```ts
  const openTransferFromNenpos = (record: NenposClient) => {
    setTransferSourceNenpos(record);
    const matchingClient = clientsQuery.data?.find(
      (c) => c.businessName.trim().toLowerCase() === record.clientName.trim().toLowerCase(),
    );
    setClientId(matchingClient?.id ?? '');
    setProductId('');
    setLicenseKey(record.license ?? '');
    setIsTrial(false);
    setNenposTransferPassword('');
    setNenposTransferConfirmName('');
    setGenerateError('');
    setShowForm(true);
  };
```

Note this reads `clientsQuery.data`, which is only fetched `enabled: showForm || !!editingLicense` (line 640) — since `setShowForm(true)` is called in the same function body, on the *first* open the list may still be loading. Update the `clientsQuery` `enabled` condition so it's also fetched while the NENPOS Clients tab is active, so the dropdown has data by the time an admin clicks "Transfer": replace

```ts
  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showForm || !!editingLicense,
  });
```

with

```ts
  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showForm || !!editingLicense || activeTab === 'nenpos',
  });
```

- [ ] **Step 3: Extend the Add License dialog with the transfer-only confirmation step**

Find the closing of the Add License form's field list, just before the error/submit block:

```tsx
              {generateError && <p className="error-text">{generateError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={generateLicense.isPending} style={{ flex: 1 }}>
                  {generateLicense.isPending ? 'Saving…' : 'Save license'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialExpiresAt(defaultTrialDate()); }}>Cancel</button>
              </div>
            </form>
          </Dialog>
```

Replace with:

```tsx
              {transferSourceNenpos && (
                <>
                  <div className="field">
                    <label htmlFor="nenpos-transfer-password">Your login password</label>
                    <input
                      id="nenpos-transfer-password" type="password" required autoComplete="current-password"
                      value={nenposTransferPassword} onChange={(e) => setNenposTransferPassword(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="nenpos-transfer-confirm-name">
                      Type <strong>{transferSourceNenpos.clientName}</strong> to confirm
                    </label>
                    <input
                      id="nenpos-transfer-confirm-name" type="text" required
                      value={nenposTransferConfirmName} onChange={(e) => setNenposTransferConfirmName(e.target.value)}
                    />
                  </div>
                </>
              )}
              {generateError && <p className="error-text">{generateError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button
                  type="submit" className="btn btn-primary" style={{ flex: 1 }}
                  disabled={
                    generateLicense.isPending ||
                    (!!transferSourceNenpos &&
                      (!nenposTransferPassword || nenposTransferConfirmName.trim() !== transferSourceNenpos.clientName.trim()))
                  }
                >
                  {generateLicense.isPending ? 'Saving…' : transferSourceNenpos ? 'Save and finish transfer' : 'Save license'}
                </button>
                <button
                  type="button" className="btn btn-secondary"
                  onClick={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialExpiresAt(defaultTrialDate()); setTransferSourceNenpos(null); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </Dialog>
```

- [ ] **Step 4: Chain the NENPOS void call after a successful generate, when transferring**

Replace the `generateLicense` mutation:

```ts
  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, expirationDate: new Date(`${trialExpiresAt}T23:59:59`).toISOString() }
        : { clientId, productId, licenseKey: licenseKey.trim() };
      return (await api.post<License>('/licenses', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialExpiresAt(defaultTrialDate());
      setGenerateError(''); setShowForm(false);
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });
```

with:

```ts
  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, expirationDate: new Date(`${trialExpiresAt}T23:59:59`).toISOString() }
        : { clientId, productId, licenseKey: licenseKey.trim() };
      const created = (await api.post<License>('/licenses', payload)).data;

      if (transferSourceNenpos) {
        await api.post(`/nenpos-clients/${transferSourceNenpos.id}/void`, {
          password: nenposTransferPassword,
          confirmName: nenposTransferConfirmName,
          transferredToLicenseId: created.id,
        });
      }

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialExpiresAt(defaultTrialDate());
      setGenerateError(''); setShowForm(false);
      setTransferSourceNenpos(null);
      setNenposTransferPassword(''); setNenposTransferConfirmName('');
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });
```

Note: if the void call fails after the license was already created (e.g. wrong password), the new license stays — the admin sees the generic error, can retry the void separately from the NENPOS row's own "Void" button (Task 9) using `transferredToLicenseId` manually. This edge case is acceptable for a rare, admin-only correction flow and matches the spec's non-goals (no distributed-transaction rollback across the two independent tables).

- [ ] **Step 5: Add the "Transfer to Bhagoh License" button on NENPOS rows**

In `NenposClientsTab`'s row actions (modified in Task 9), add a new button before "Void". This requires passing `openTransferFromNenpos` down as a prop, since it's defined in the parent `LicensesPage`, not in `NenposClientsTab`.

Change `NenposClientsTab`'s signature:

```ts
function NenposClientsTab() {
```

to:

```ts
function NenposClientsTab({ onTransferToLicense }: { onTransferToLicense: (record: NenposClient) => void }) {
```

Add the button in the row actions (directly before the "Void" button from Task 9):

```tsx
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                  onClick={() => onTransferToLicense(row)}
                                >
                                  Transfer
                                </button>
```

Finally, update where `NenposClientsTab` is rendered:

```tsx
      {activeTab === 'nenpos' && isAdminRole && <NenposClientsTab />}
```

to:

```tsx
      {activeTab === 'nenpos' && isAdminRole && <NenposClientsTab onTransferToLicense={openTransferFromNenpos} />}
```

- [ ] **Step 6: Manual verification**

1. On the NENPOS Clients tab, click "Transfer" on a record whose `clientName` matches an existing `Client.businessName` exactly → the Add License dialog opens with that client pre-selected and the license key pre-filled.
2. Pick a product, fill in password + exact client name, submit → expect a new license to appear on the Bhagoh Licenses tab and the source NENPOS row to show a "Transferred to Bhagoh" badge (with "Show voided/transferred" checked).
3. Try the same with a NENPOS record whose name does *not* match any existing client → the client dropdown opens on "Select a client…" with no pre-selection; confirm the admin can still pick one manually (or must create it first on the Clients page, per the spec's non-goals).

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "$(cat <<'EOF'
feat(admin-web): add Transfer-to-Bhagoh-License action to the NENPOS Clients tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
