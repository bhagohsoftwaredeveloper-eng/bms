# Trial License — Design Spec

**Date:** 2026-07-24
**Status:** Approved (pending final spec review)

## Problem

Admins currently create a "trial" license by manually typing `trial` in the free-text
License Key field. Two problems:

1. The `license_key` column is `@unique`, so a **second** license keyed `trial` fails with a
   `ConflictException` ("A license with this key already exists").
2. There is no real trial semantics — no automatic expiry, and the `EXPIRED` status
   (which exists in the `LicenseStatus` enum) is never set anywhere in the backend.

We want a proper **Trial license** concept: a license flagged as a trial, with an
auto-generated unique key and an automatic expiry period, that still follows the existing
developer on-site activation flow.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Activation flow | **Same as regular** — trial still goes through developer on-site activation (hardware fingerprint + RSA-4096-signed JWT). Only the expiry is automatic. |
| Trial duration | **Admin sets per trial** — a `Trial days` input, default 30, editable per trial. |
| Countdown start | **From activation** — `expirationDate = activationDate + trialDays`, so the client gets the full trial period from install. |
| License key | **Auto-generated** — system generates a unique `TRIAL-XXXX-XXXX` key; admin does not type it. |
| Auto-expire | **Daily cron** — a scheduled job flips `ACTIVATED` licenses whose `expirationDate` has passed to `EXPIRED`. Applies to trials and regular licenses with an expiry. |
| Badge | **Permanent** — a "TRIAL" badge is always shown in the list and in View Details. |

## Current state (reference)

- `License` model: `licenseKey @unique`, `clientId`, `productId`, `activatedById?`,
  `activationDate?`, `expirationDate?`, `status LicenseStatus @default(PENDING)`,
  `licenseToken?`, `hardwareFingerprint?`. (`prisma/schema.prisma:246`)
- `LicenseStatus` enum: `PENDING | ACTIVATED | EXPIRED | SUSPENDED`. `EXPIRED` is currently
  never assigned. (`prisma/schema.prisma:51`)
- Flow: admin `POST /licenses` (generate → PENDING, manual key, optional expiry) → developer
  `PATCH /licenses/:id/activate` (binds fingerprint, signs JWT with `expiresIn` derived from
  `expirationDate`, → ACTIVATED) → admin `PATCH /licenses/:id/suspend` (→ SUSPENDED).
  (`src/licenses.service.ts`, `src/licenses.controller.ts`)
- Expiry is enforced only inside the signed JWT (`expiresIn`); the DB status is not updated.
  (`src/license-crypto.service.ts:58`)
- `@nestjs/schedule` (^6.1.3) is already installed and used for the nightly backup cron
  (`src/backups.service.ts`, `src/app.module.ts`).
- Admin UI form currently sends only `{ clientId, productId, licenseKey }` — it does not
  collect `expirationDate` for regular licenses. (`admin-web/src/pages/LicensesPage.tsx:519`)

## Design

### 1. Data model

Add two fields to the `License` model:

```prisma
isTrial   Boolean @default(false) @map("is_trial")
trialDays Int?                     @map("trial_days")
```

- `isTrial` — distinguishes trial vs regular licenses (drives the badge and the
  activation-time expiry calculation).
- `trialDays` — stored at creation so activation can compute `expirationDate`.

**Alternative considered:** a `LicenseType` enum (`FULL | TRIAL`). Rejected in favor of a
boolean for simplicity (YAGNI) — there is no third type today, and migrating a boolean to an
enum later is straightforward.

New Prisma migration is additive and safe: `ADD COLUMN is_trial ...`, `ADD COLUMN trial_days ...`.

### 2. Backend — create trial (`LicensesService.generate`)

`GenerateLicenseDto` gains:

```ts
@IsOptional() @IsBoolean() isTrial?: boolean;
@IsOptional() @IsInt() @Min(1) @Max(365) trialDays?: number;
```

For `isTrial === true`:
- **Auto-generate** a unique key of the form `TRIAL-XXXX-XXXX` (uppercase alphanumeric from
  `crypto.randomBytes`). Check uniqueness against the DB and regenerate on the rare collision
  (bounded retry loop, e.g. up to 5 attempts).
- Persist `isTrial = true`, `trialDays = dto.trialDays ?? 30`, `expirationDate = null`
  (computed at activation), `status = PENDING`.
- Ignore any `licenseKey` supplied by the client.

For `isTrial` falsy: unchanged behavior — `licenseKey` required, manual/optional
`expirationDate`, `status = PENDING`.

`licenseKey` becomes optional in the DTO but is still required by the service when
`isTrial` is false (validated in the service, returning a `BadRequestException` if missing).

### 3. Backend — activate (`LicensesService.activate`)

When `license.isTrial && license.trialDays`:
- Compute `expirationDate = activationDate + trialDays` days.
- Persist that `expirationDate` on the license and pass it to
  `licenseCrypto.signLicenseToken(...)` so the JWT's `expiresIn` matches the trial window.

Regular licenses: unchanged — sign with the existing `license.expirationDate`.

The rest of activation (already-activated guard, fingerprint binding, token storage,
`status = ACTIVATED`) is unchanged.

### 4. Backend — daily auto-expire cron

Add a `@Cron` method to `LicensesService` (daily, e.g. `0 2 * * *`):

```
UPDATE licenses
SET status = 'EXPIRED'
WHERE status = 'ACTIVATED' AND expiration_date IS NOT NULL AND expiration_date < now();
```

Implemented via `prisma.license.updateMany`. Applies to both trials and regular licenses that
carry an expiry. Logs the number of licenses expired.

### 5. Frontend — `LicensesPage.tsx`

**Add License dialog:**
- Add a **Full / Trial** selector (segmented buttons or radio) at the top of the form.
- **Trial** selected: hide the License-key field (auto-generated server-side); show a
  **Trial days** number input (default 30, min 1). Client + product still required. The
  mutation posts `{ clientId, productId, isTrial: true, trialDays }`.
- **Full** selected: unchanged (manual `licenseKey`, posts `{ clientId, productId, licenseKey }`).

**Table:** show a permanent small **"TRIAL" badge** next to the key or status for
`license.isTrial` rows.

**View Details modal:** show that the license is a Trial (badge) plus the trial days and the
computed expiry date.

`License` type in `admin-web/src/lib/types.ts` gains `isTrial: boolean` and `trialDays: number | null`.

### 6. Testing

Extend `src/licenses.service.spec.ts` (follow existing patterns):
- Trial creation: auto-generates a `TRIAL-` key, key is unique, `trialDays` defaults to 30
  when omitted, `status = PENDING`, `expirationDate` is null.
- Non-trial creation still requires `licenseKey` (BadRequestException when missing).
- Activation of a trial sets `expirationDate = activationDate + trialDays` and signs the token
  with that expiry.
- Cron flips `ACTIVATED` + past-expiry licenses to `EXPIRED` and leaves others untouched.

## Out of scope (YAGNI)

- Converting an existing trial into a full license (can be a later feature).
- Collecting/editing `expirationDate` for regular licenses in the UI (unchanged today).
- Editing/deleting existing licenses (separate feature the user deferred).
