# Trial License Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a proper Trial license concept — a license flagged as a trial with an auto-generated unique key and an expiry computed at activation — plus a daily cron that marks overdue licenses EXPIRED.

**Architecture:** Extend the existing `License` model with `isTrial` + `trialDays`. Trials reuse the current developer on-site activation flow; the only differences are an auto-generated `TRIAL-XXXX-XXXX` key at creation and `expirationDate = activationDate + trialDays` computed during activation. A `@nestjs/schedule` cron flips expired `ACTIVATED` licenses to `EXPIRED`. The admin UI gains a Full/Trial toggle and a permanent TRIAL badge.

**Tech Stack:** NestJS + Prisma (MySQL) backend, Jest tests; React + TypeScript + TanStack Query admin-web (Vite).

## Global Constraints

- Backend tests run with `npm test` (Jest; `rootDir` = `src`, files match `*.spec.ts`). Run a single file with `npm test -- <path>`.
- Trial marker is a **boolean `isTrial`**, NOT an enum. Do not add a `LicenseType` enum (the name `LicenseType` is already used in the frontend for `SoftwareProduct.licenseType`).
- Prisma migrations must be **additive** (`ADD COLUMN`). Railway auto-runs `prisma migrate deploy` at startup (see `src/main.ts`), so a committed migration deploys itself.
- Default trial length is **30 days**; admin may override per trial (min 1, max 365).
- Countdown starts at **activation**: `expirationDate = activationDate + trialDays` days.
- Do NOT implement license editing, deleting, or trial→full conversion — out of scope.
- Follow existing patterns: service specs construct the service directly with mocked `prisma`/deps (see `src/job-orders.service.spec.ts`), not the Nest testing module.
- A local MySQL matching `DATABASE_URL` must be running for `prisma migrate dev`.

---

### Task 1: Schema + migration for `isTrial` / `trialDays`

**Files:**
- Modify: `prisma/schema.prisma:246-269` (License model)
- Create: `prisma/migrations/<timestamp>_add_trial_license/migration.sql` (generated)

**Interfaces:**
- Produces: `License.isTrial: boolean` (default false), `License.trialDays: number | null` on the Prisma client.

- [ ] **Step 1: Add the fields to the License model**

In `prisma/schema.prisma`, inside `model License`, add these two lines right after the `status` line (`status LicenseStatus @default(PENDING)`):

```prisma
  isTrial   Boolean @default(false) @map("is_trial")
  trialDays Int?                    @map("trial_days")
```

- [ ] **Step 2: Generate the migration and client**

Run: `npx prisma migrate dev --name add_trial_license`
Expected: creates `prisma/migrations/<timestamp>_add_trial_license/migration.sql`, applies it, and regenerates the client. The SQL should be:

```sql
-- AlterTable
ALTER TABLE `licenses`
    ADD COLUMN `is_trial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `trial_days` INTEGER NULL;
```

- [ ] **Step 3: Verify the client picked up the fields**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no type errors — the new fields exist on the generated `License` type).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add isTrial + trialDays to License"
```

---

### Task 2: Trial key generator utility

**Files:**
- Create: `src/trial-key.util.ts`
- Test: `src/trial-key.util.spec.ts`

**Interfaces:**
- Produces: `generateTrialKey(): string` returning a key matching `/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/`.

- [ ] **Step 1: Write the failing test**

Create `src/trial-key.util.spec.ts`:

```ts
import { generateTrialKey } from './trial-key.util';

describe('generateTrialKey', () => {
  it('matches the TRIAL-XXXX-XXXX format', () => {
    expect(generateTrialKey()).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('produces different keys across many calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateTrialKey()));
    expect(keys.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trial-key.util.spec.ts`
Expected: FAIL — cannot find module `./trial-key.util`.

- [ ] **Step 3: Write the implementation**

Create `src/trial-key.util.ts`:

```ts
import { randomBytes } from 'node:crypto';

// Ambiguity-free alphabet (no I, O, 0, 1) so keys are easy to read/dictate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function segment(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generate a trial license key like `TRIAL-A2B3-C4D5`. */
export function generateTrialKey(): string {
  return `TRIAL-${segment(4)}-${segment(4)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/trial-key.util.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/trial-key.util.ts src/trial-key.util.spec.ts
git commit -m "feat: add trial license key generator"
```

---

### Task 3: DTO + service — create a trial license

**Files:**
- Modify: `src/generate-license.dto.ts`
- Modify: `src/licenses.service.ts:15-40` (`generate`) and imports
- Test: `src/licenses.service.spec.ts` (create)

**Interfaces:**
- Consumes: `generateTrialKey()` from Task 2.
- Produces: `LicensesService.generate(dto)` accepting `{ clientId, productId, isTrial?, trialDays?, licenseKey?, expirationDate? }`. For trials it auto-generates a unique `TRIAL-` key, defaults `trialDays` to 30, and leaves `expirationDate` null.

- [ ] **Step 1: Extend the DTO**

Replace the contents of `src/generate-license.dto.ts` with:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateLicenseDto {
  // Required for full licenses (issued by the 3rd-party provider). Ignored for
  // trials — the server auto-generates a unique TRIAL- key.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseKey?: string;

  @IsString()
  clientId!: string;

  @IsString()
  productId!: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  // Trial length in days (default 30). Only used when isTrial is true.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/licenses.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { LicensesService } from './licenses.service';

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

describe('LicensesService.generate (trial)', () => {
  it('auto-generates a unique TRIAL- key and defaults trialDays to 30', async () => {
    const { service } = buildService();
    const result = await service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true } as never);
    expect(result.licenseKey).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.trialDays).toBe(30);
    expect(result.isTrial).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.expirationDate).toBeNull();
  });

  it('honors an explicit trialDays value', async () => {
    const { service } = buildService();
    const result = await service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true, trialDays: 14 } as never);
    expect(result.trialDays).toBe(14);
  });

  it('rejects a non-trial license with no key', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/licenses.service.spec.ts`
Expected: FAIL — trial branch not implemented (key is `undefined`, or a `ConflictException`/other error instead of the trial path).

- [ ] **Step 4: Implement the trial branch in the service**

In `src/licenses.service.ts`, update the imports on line 1 to include the extra exceptions, and add the util import:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { LicenseCryptoService } from './license-crypto.service';
import { generateTrialKey } from './trial-key.util';
```

Replace the `generate` method (lines 15-40) with:

```ts
  async generate(dto: GenerateLicenseDto) {
    const [client, product] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: dto.clientId } }),
      this.prisma.softwareProduct.findUnique({ where: { id: dto.productId } }),
    ]);

    if (!client) throw new NotFoundException(`Client ${dto.clientId} not found`);
    if (!product) throw new NotFoundException(`Software product ${dto.productId} not found`);

    if (dto.isTrial) {
      const licenseKey = await this.generateUniqueTrialKey();
      return this.prisma.license.create({
        data: {
          licenseKey,
          clientId: dto.clientId,
          productId: dto.productId,
          isTrial: true,
          trialDays: dto.trialDays ?? 30,
          expirationDate: null,
          status: LicenseStatus.PENDING,
        },
      });
    }

    if (!dto.licenseKey) {
      throw new BadRequestException('License key is required for a non-trial license');
    }

    const existing = await this.prisma.license.findUnique({
      where: { licenseKey: dto.licenseKey },
    });
    if (existing) {
      throw new ConflictException('A license with this key already exists');
    }

    return this.prisma.license.create({
      data: {
        licenseKey: dto.licenseKey,
        clientId: dto.clientId,
        productId: dto.productId,
        expirationDate: dto.expirationDate,
        status: LicenseStatus.PENDING,
      },
    });
  }

  /** Generate a TRIAL- key, retrying on the rare collision against the unique index. */
  private async generateUniqueTrialKey(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = generateTrialKey();
      const clash = await this.prisma.license.findUnique({ where: { licenseKey: key } });
      if (!clash) return key;
    }
    throw new InternalServerErrorException('Could not generate a unique trial license key');
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/licenses.service.spec.ts`
Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add src/generate-license.dto.ts src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat: create trial licenses with auto-generated keys"
```

---

### Task 4: Activation computes trial expiry

**Files:**
- Modify: `src/licenses.service.ts` (`activate`, lines ~66-95)
- Test: `src/licenses.service.spec.ts` (add cases)

**Interfaces:**
- Consumes: `License.isTrial`, `License.trialDays` from Task 1; `generate` behavior from Task 3.
- Produces: `activate(id, developerId, dto)` sets `expirationDate = activationDate + trialDays` days for trials, and signs the token with that expiry.

- [ ] **Step 1: Add the failing test**

Append to `src/licenses.service.spec.ts`:

```ts
describe('LicensesService.activate (trial)', () => {
  it('sets expirationDate = activation + trialDays and signs with that expiry', async () => {
    const { service, prisma, crypto } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: null,
      client: {},
      product: {},
      activatedBy: null,
    });

    const before = Date.now();
    const result = await service.activate('lic-1', 'dev-1', {
      fingerprint: { cpu: 'c', disk: 'd', mac: 'm' },
    } as never);

    const expiry = new Date(result.expirationDate as Date).getTime();
    // ~30 days out (allow a small margin below 30 for execution time).
    expect(expiry).toBeGreaterThan(before + 29.9 * 24 * 60 * 60 * 1000);
    expect(crypto.signLicenseToken).toHaveBeenCalledTimes(1);
    const passedExpiry = (crypto.signLicenseToken.mock.calls[0][1] as Date).getTime();
    expect(passedExpiry).toBe(expiry);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/licenses.service.spec.ts -t "activate (trial)"`
Expected: FAIL — `expirationDate` is null (activation currently uses the stored `expirationDate`, which is null for trials).

- [ ] **Step 3: Implement the trial expiry in `activate`**

In `src/licenses.service.ts`, replace the body of `activate` from the `const activationDate = new Date();` line through the `return this.prisma.license.update(...)` call with:

```ts
    const activationDate = new Date();
    const expirationDate =
      license.isTrial && license.trialDays
        ? new Date(activationDate.getTime() + license.trialDays * 24 * 60 * 60 * 1000)
        : license.expirationDate;

    const licenseToken = this.licenseCrypto.signLicenseToken(
      {
        licenseId: license.id,
        licenseKey: license.licenseKey,
        clientId: license.clientId,
        productId: license.productId,
        fingerprint: dto.fingerprint,
      },
      expirationDate ?? undefined,
    );

    return this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVATED,
        activatedById: developerId,
        activationDate,
        expirationDate,
        hardwareFingerprint: dto.fingerprint as unknown as object,
        licenseToken,
      },
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/licenses.service.spec.ts`
Expected: PASS (all cases, including the earlier ones).

- [ ] **Step 5: Commit**

```bash
git add src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat: compute trial expiry at activation"
```

---

### Task 5: Daily auto-expire cron

**Files:**
- Modify: `src/licenses.service.ts` (add `Logger` + `Cron`, new method)
- Test: `src/licenses.service.spec.ts` (add case)

**Interfaces:**
- Produces: `LicensesService.expireOverdueLicenses(): Promise<void>` — flips `ACTIVATED` licenses whose `expirationDate` has passed to `EXPIRED` via `updateMany`.

- [ ] **Step 1: Add the failing test**

Append to `src/licenses.service.spec.ts`:

```ts
describe('LicensesService.expireOverdueLicenses', () => {
  it('flips activated, past-expiry licenses to EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.updateMany.mockResolvedValue({ count: 2 });

    await service.expireOverdueLicenses();

    expect(prisma.license.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.license.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe('ACTIVATED');
    expect(arg.where.expirationDate.lt).toBeInstanceOf(Date);
    expect(arg.data).toEqual({ status: 'EXPIRED' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/licenses.service.spec.ts -t "expireOverdueLicenses"`
Expected: FAIL — `service.expireOverdueLicenses is not a function`.

- [ ] **Step 3: Implement the cron method**

In `src/licenses.service.ts`, add `Logger` to the `@nestjs/common` import and import `Cron`:

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
```

Add a logger field inside the class (right below the `constructor(...) {}`):

```ts
  private readonly logger = new Logger(LicensesService.name);
```

Add this method to the class (e.g. after `suspend`):

```ts
  /**
   * Daily sweep: mark activated licenses whose expiry has passed as EXPIRED so the
   * admin dashboard reflects reality (trials and any regular license with an expiry).
   * The signed JWT already enforces expiry on the client; this keeps the DB in sync.
   */
  @Cron('0 2 * * *')
  async expireOverdueLicenses(): Promise<void> {
    const result = await this.prisma.license.updateMany({
      where: {
        status: LicenseStatus.ACTIVATED,
        expirationDate: { not: null, lt: new Date() },
      },
      data: { status: LicenseStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} license(s) past their expiration date`);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/licenses.service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the whole backend builds**

Run: `npx nest build`
Expected: exit 0, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat: daily cron marks overdue licenses EXPIRED"
```

---

### Task 6: Frontend — Full/Trial toggle in the Add License dialog

**Files:**
- Modify: `admin-web/src/lib/types.ts:55-66` (License interface)
- Modify: `admin-web/src/pages/LicensesPage.tsx` (state, mutation, Add dialog)

**Interfaces:**
- Consumes: backend `POST /licenses` accepting `{ clientId, productId, isTrial, trialDays }` (trial) or `{ clientId, productId, licenseKey }` (full).
- Produces: `License` type with `isTrial: boolean` and `trialDays: number | null`, used by Task 7.

- [ ] **Step 1: Extend the License type**

In `admin-web/src/lib/types.ts`, add two fields to the `License` interface (after `expirationDate`):

```ts
  isTrial: boolean;
  trialDays: number | null;
```

- [ ] **Step 2: Add trial state to the page**

In `admin-web/src/pages/LicensesPage.tsx`, add state alongside the existing license form state (near line 490, after `const [licenseKey, setLicenseKey] = useState('');`):

```ts
  const [isTrial, setIsTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(30);
```

- [ ] **Step 3: Send the right payload from the mutation**

Replace the `generateLicense` mutation's `mutationFn` and `onSuccess` (near line 517-523) with:

```ts
  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, trialDays }
        : { clientId, productId, licenseKey: licenseKey.trim() };
      return (await api.post<License>('/licenses', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialDays(30);
      setGenerateError(''); setShowForm(false);
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });
```

- [ ] **Step 4: Add the toggle + conditional fields to the dialog**

In the Add License dialog form (the `<form>` starting near line 603), insert this block **before** the Client field (`<div className="field"><label htmlFor="clientId">`):

```tsx
              <div className="field">
                <label>License type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${!isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(false)}
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    className={`btn ${isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(true)}
                  >
                    Trial
                  </button>
                </div>
              </div>
```

Then wrap the existing License-key field so it only shows for full licenses, and add the Trial-days field for trials. Replace the whole License-key `<div className="field">…</div>` block (near lines 622-636) with:

```tsx
              {isTrial ? (
                <div className="field">
                  <label htmlFor="trialDays">Trial days</label>
                  <input
                    id="trialDays"
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    A unique trial key is generated automatically. The countdown starts when the developer activates it on-site.
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="licenseKey">License key</label>
                  <input
                    id="licenseKey"
                    type="text"
                    required
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="Enter the key issued by the provider"
                    style={{ fontFamily: 'monospace' }}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Enter the license key issued by the 3rd-party provider.
                  </p>
                </div>
              )}
```

- [ ] **Step 5: Reset trial state when the dialog is cancelled**

In the Add License dialog's `onClose` and the Cancel button `onClick` (both call `setShowForm(false); setGenerateError('');`), also reset the trial fields. Change both handlers to:

```tsx
onClose={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialDays(30); }}
```

and the Cancel button:

```tsx
onClick={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialDays(30); }}
```

- [ ] **Step 6: Verify the admin-web builds**

Run: `npm run build --prefix admin-web`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin): Full/Trial toggle in Add License dialog"
```

---

### Task 7: Frontend — permanent TRIAL badge in list + View Details

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx` (table row, View Details dialog)

**Interfaces:**
- Consumes: `License.isTrial`, `License.trialDays` from Task 6.

- [ ] **Step 1: Add a small TrialBadge helper**

In `admin-web/src/pages/LicensesPage.tsx`, add this helper near the top-level helpers (e.g. after `fmtDate`, around line 16):

```tsx
function TrialBadge() {
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
      background: 'var(--accent)', color: '#fff',
      borderRadius: 4, padding: '0.1rem 0.35rem', marginLeft: '0.4rem',
      verticalAlign: 'middle',
    }}>
      TRIAL
    </span>
  );
}
```

- [ ] **Step 2: Show the badge in the License Key table cell**

In the licenses table body, replace the License Key `<td>` (near line 757) with:

```tsx
                              <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {license.licenseKey}
                                {license.isTrial && <TrialBadge />}
                              </td>
```

- [ ] **Step 3: Show trial info in the View Details dialog**

In the View license dialog (near lines 686-702), update the Status DetailRow to include the badge and add a Trial Period row. Replace the Status `DetailRow` (line 687) with:

```tsx
                  <DetailRow label="Status" value={<><StatusBadge status={viewLicense.status} />{viewLicense.isTrial && <TrialBadge />}</>} />
```

And add this row right after the Software Product `DetailRow` (line 695):

```tsx
                {viewLicense.isTrial && (
                  <DetailRow label="Trial Period" value={`${viewLicense.trialDays ?? 30} days from activation`} />
                )}
```

- [ ] **Step 4: Verify the admin-web builds**

Run: `npm run build --prefix admin-web`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin): permanent TRIAL badge in list + details"
```

---

## Self-Review

**Spec coverage:**
- Data model (`isTrial`, `trialDays`) → Task 1. ✓
- Auto-generated unique `TRIAL-` key → Tasks 2 + 3. ✓
- Create trial (DTO + service, default 30, key ignored) → Task 3. ✓
- Same activation flow, expiry = activation + trialDays → Task 4. ✓
- Daily auto-expire cron → Task 5. ✓
- Full/Trial toggle, hide key + trial-days input → Task 6. ✓
- Permanent TRIAL badge in list + View Details → Task 7. ✓
- Testing (service + util specs) → Tasks 2-5. ✓
- Out-of-scope items (edit/delete/convert, regular-license expiry UI) correctly omitted. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `generateTrialKey` (Task 2) used identically in Task 3. `isTrial`/`trialDays` names consistent across schema (Task 1), DTO/service (Task 3-4), types.ts + UI (Tasks 6-7). `expireOverdueLicenses` defined and tested in Task 5. `signLicenseToken(payload, expiry?)` matches the existing `LicenseCryptoService` signature. ✓
