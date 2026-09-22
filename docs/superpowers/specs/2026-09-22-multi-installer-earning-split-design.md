# Multi-Installer Job Assignment + Equal-Split Incentives

## Problem

Today a `Job` has a single `installerId` (`prisma/schema.prisma:309`). When an
installation completes, `EarningsService.ensureInstallationEarning()`
computes one total amount (via `computeInstallationEarning()` in
`src/installation-earning.util.ts`, priced by client location and licensed
computer count) and creates **one** `Earning` row for that single installer.

In practice, two or three installers sometimes travel together to a client
site to do the install. There is currently no way to:

- assign more than one installer to a job,
- let any of them submit the installation proof, or
- split the computed incentive amount between them.

This spec adds multi-installer assignment and an equal split of the
installation incentive among everyone assigned to the job.

## Non-goals (explicit scope cuts)

- No unequal/weighted splits (lead vs. helper percentages) — straight equal
  division only, decided per user.
- No UI to reassign/change the split after earnings have already been
  created for a job (existing one-shot "create once" behavior for
  `ensureInstallationEarning` is preserved).
- No change to CCTV/signage job earnings (job-order-priced labor), which are
  already skipped by `ensureInstallationEarning`.
- No retroactive re-splitting of already-created `Earning` rows if installers
  are added/removed after the earning was generated — the split is computed
  once, at proof-submission time, same as today.

## Data model changes (Prisma)

Add a join table; keep `Job.installerId` as-is.

```prisma
model JobInstaller {
  id        String   @id @default(uuid())
  jobId     String   @map("job_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  job  Job  @relation(fields: [jobId], references: [id])
  user User @relation("JobInstallers", fields: [userId], references: [id])

  @@unique([jobId, userId])
  @@map("job_installers")
}
```

- `Job.installerId` remains the **primary/lead** installer: first entry in
  the assigned list, used for the existing "job assigned" push notification
  and as the display fallback anywhere only a single name made sense before.
- `JobInstaller` is the source of truth for "everyone assigned to this job"
  (it includes the primary too) and is what earnings-splitting and the
  installer's "My Jobs" list read from.
- A migration adds the `job_installers` table. A one-time backfill script
  inserts one `JobInstaller` row (`jobId`, `installerId`) for every existing
  `Job` that already has an `installerId`, so historical single-installer
  jobs behave identically under the new code path (list of 1 → no split).

## Backend changes

### DTOs

`CreateJobDto`, `UpdateJobDto`, `AssignInstallerDto`
(`src/create-job.dto.ts`, `src/update-job.dto.ts`,
`src/assign-installer.dto.ts`): replace `installerId?: string` with
`installerIds?: string[]` (validated as a non-empty array of strings when
present).

### JobsService (`src/jobs.service.ts`)

- `create()`, `update()`, `assignInstaller()`: given `installerIds`, set
  `installerId = installerIds[0]` on the `Job` row and, in the same
  transaction, replace that job's `JobInstaller` rows (delete existing,
  insert one per id, `skipDuplicates` on the unique constraint).
- `notifyAssignment`: send the "You've been assigned an installation job"
  notification to **every** id in `installerIds`, not just the first.
- `findAll(userId, role)`: when `role === 'INSTALLER'`, filter jobs where
  `installers: { some: { userId } }` (covers primary + helpers) instead of
  `installerId: userId`.
- `findOne()`: include `installers: { include: { user: { select: { id: true, fullName: true } } } }`
  so the UI can show the full team.
- `assertOwnedByInstaller()` (used by `submitProof`): a job is "owned" by a
  user if they appear in that job's `JobInstaller` list (falls back to
  `installerId` equality for legacy jobs with no join rows yet, i.e. before
  the backfill or for jobs created by not-yet-updated clients).

### EarningsService (`src/earnings.service.ts`)

- `ensureInstallationEarning(jobId)`: load the job's `JobInstaller` rows.
  - If none exist, fall back to today's behavior: single earner =
    `job.installerId`, full amount, no split.
  - If one or more exist, compute the total via `computeInstallationEarning`
    (unchanged formula/pricing), then split it across `installers.length`
    installers using a new `splitInstallationEarning(total, count)` helper.
  - Create one `Earning` row per installer (`type: 'INSTALLATION'`), each
    with its split `amount`, and a `note` that includes the original pricing
    note plus `"Split N ways: ₱X.XX each"`.
  - The existing "already created" guard (`findFirst({ jobId, type: 'INSTALLATION' })`)
    stays: once any installation earning exists for the job, the method is a
    no-op, so this remains a one-shot creation per job.

### `splitInstallationEarning` (`src/installation-earning.util.ts`)

- Straight division, rounded to 2 decimals per installer:
  `share = round2(total / count)`.
- Per the confirmed rounding rule, the sum of shares may differ from `total`
  by up to a cent or two (e.g. ₱500 ÷ 3 → ₱166.67 × 3 = ₱500.01); this is
  accepted, not corrected.
- `count <= 1` returns `[total]` unchanged (matches current single-installer
  math exactly).

## Admin-web changes (`admin-web/src/pages/JobsPage.tsx`)

- Replace the single `<select>` for "Installer" (create form, edit form, and
  the Assign modal) with a multi-select control (checkbox list) bound to
  `installerIds: string[]`.
- Jobs table "Installer" column: join all assigned names, e.g.
  `"Juan, Maria +1"` (falls back to "Unassigned" when empty, same as today).
- `admin-web/src/lib/types.ts`: extend the `Job` type with an `installers?: { user: { id: string; fullName: string } }[]` field.

## Mobile changes

- `GET /jobs?mine=true` (`mobile/app/(tabs)/index.tsx`) needs no client-side
  change — it already just calls the endpoint; the backend filter update
  (above) is what makes it return jobs where the user is a helper, not only
  a primary installer.
- `mobile/app/job/[id].tsx`: show the full assigned team (from the job's
  `installers` list) instead of a single installer name.
- No change to the proof-submission screen itself: any assigned installer
  can already reach it and submit, since `assertOwnedByInstaller` now checks
  membership instead of exact match.

## Testing

- `src/installation-earning.util.spec.ts`: add cases for
  `splitInstallationEarning` — equal split with no remainder, split with a
  remainder (e.g. 500/3), `count === 1` (unchanged), `count === 0` guarded
  to behave like 1.
- `src/earnings.service.spec.ts`: `ensureInstallationEarning` creates N
  `Earning` rows for N `JobInstaller`s with correct split amounts; creates
  exactly one legacy-style row when there are no `JobInstaller` rows;
  idempotent (second call is a no-op) in both cases.
- `src/jobs.service.spec.ts` (new or extended): `assignInstaller`/`create`
  write the expected `JobInstaller` rows and set `installerId` to the first
  id; `findAll` for an `INSTALLER` role returns jobs where the user is a
  helper (not just primary); `submitProof` succeeds for a non-primary
  assigned installer and still rejects an unassigned one.
