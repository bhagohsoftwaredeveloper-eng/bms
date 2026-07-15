# Project Job Order (Software / CCTV / Signage) — Design

**Date:** 2026-07-15
**Status:** Approved

## Goal

Rename "Software JO" to "Project Job Order" and support two new project
types — CCTV installation and signage installation — with automatic
installer labor incentives: per-camera rate for CCTV, and a percentage of
the total price (default 20%) for signage.

## Background

- A `JobOrder` is 1:1 with an installation `Job` (client + schedule +
  single `installerId`), has `salePrice`, discount, materials `items`,
  and `payments`. The UI calls it "Software JO".
- The `Earning` model (`type: INSTALLATION | ACTIVATION | BONUS | COMMISSION`,
  `status: PENDING | APPROVED | PAID`) already powers installer earnings and
  withdrawals; earnings are currently created manually via the API.
- Grand total math lives in `src/job-order-pricing.util.ts` mirrored by
  `computeTotals()` in `admin-web/src/pages/JobOrderPage.tsx`.

Decisions made during brainstorming:

- CCTV/Signage JOs use the **same Job flow** (create Job with installer +
  schedule first, then the JO).
- CCTV labor uses **explicit fields** on the JO: camera count and rate per
  camera (not derived from items).
- Signage labor percentage is **editable per JO, default 20**.
- On **finalize**, the backend **auto-creates a PENDING Earning** for the
  linked Job's installer.

## Data model

Prisma migration:

```prisma
enum JobOrderType {
  SOFTWARE
  CCTV
  SIGNAGE
}

model JobOrder {
  // new fields
  type        JobOrderType @default(SOFTWARE)            // existing rows stay SOFTWARE
  cameraCount Int?         @map("camera_count")           // CCTV only
  cameraRate  Decimal?     @map("camera_rate") @db.Decimal(12, 2)  // CCTV only, ₱ per camera
  laborPct    Decimal?     @map("labor_pct") @db.Decimal(5, 2)     // SIGNAGE only, default 20 set by app
  // ...all existing fields unchanged
}
```

No changes to `Job`, `Earning`, `Payment`, or invoice math.

## Labor incentive rules

New pure util `computeLaborIncentive(type, salePrice, cameraCount, cameraRate, laborPct): number`
in `src/job-order-pricing.util.ts` (unit-tested alongside the existing pricing utils):

| Type | Labor incentive |
|---|---|
| SOFTWARE | 0 — existing KPI-based incentives are untouched |
| CCTV | `cameraCount × cameraRate` |
| SIGNAGE | `salePrice × laborPct / 100` (salePrice = total signage price) |

The labor incentive is an internal cost — it never appears on the client
invoice and does not affect `computeGrandTotal`.

## Finalize → auto-Earning

When a CCTV or SIGNAGE job order transitions to `FINALIZED`:

1. Validate: linked `Job` must have an `installerId` — otherwise reject with
   `BadRequestException('Assign an installer to the job before finalizing.')`.
2. Validate: computed labor must be > 0 — otherwise reject with a message
   naming the missing fields (camera count/rate, or labor %).
3. Create `Earning { userId: job.installerId, jobId: job.id, amount: labor, type: INSTALLATION, status: PENDING }`.
4. Idempotency: if an `INSTALLATION` earning for this `jobId` already exists,
   skip creation (re-finalizing or double-clicking must not duplicate).

SOFTWARE finalize behavior is unchanged. Approval/payout uses the existing
Earnings flow (admin approves; installer sees it in the mobile app).

## Backend changes

- `CreateJobOrderDto` / update DTO: add `type` (enum, default SOFTWARE),
  `cameraCount` (optional int ≥ 1), `cameraRate` (optional ≥ 0),
  `laborPct` (optional 0–100). Per-type validation happens at finalize
  (drafts may be incomplete).
- Job Orders service: persist new fields; hook the auto-Earning into the
  existing finalize path.

## Frontend changes (admin-web)

**Rename** (labels only, route `/job-orders/software` unchanged):
- `AdminLayout.tsx` nav entries (4 role menus): "Software JO" → "Project JO"
- `JobOrdersPage.tsx`: title "Project Job Order", button "Create Project JO",
  subtitle updated to mention software, CCTV, and signage projects
- `JobOrderPage.tsx`: headers and "← Back to Software JO" links → "Project JO"
- `DashboardPage.tsx`: "Software JOs" card label → "Project JOs"

**JobOrdersPage:** new **Type** column with a small badge (Software / CCTV /
Signage).

**JobOrderPage (create/edit):**
- **Project Type** selector (Software / CCTV / Signage) at the top of the form.
- Conditional fields:
  - Software: product dropdown (unchanged)
  - CCTV: "No. of Cameras" + "Rate per Camera (₱)"
  - Signage: "Labor %" (defaults to 20)
- Live "Installer Labor" summary box showing the computed amount and the
  installer's name from the linked Job (with a warning when the Job has no
  installer).
- `admin-web/src/lib/types.ts`: extend the `JobOrder` interface with `type`,
  `cameraCount`, `cameraRate`, `laborPct`.

Mobile app label changes are out of scope for this spec.

## Out of scope

- Changing the client-facing invoice or grand-total math.
- Global settings for default camera rate (rate is entered per JO).
- Splitting labor among multiple installers (Job has a single installer).
- Mobile app UI changes.
- Migrating existing KPI-based incentives.

## Testing

- Unit: `computeLaborIncentive` (all three types, zero/missing inputs).
- Unit: finalize auto-Earning — happy path, idempotency (second finalize
  creates nothing), missing installer rejection, zero-labor rejection.
- Manual: create one JO of each type end-to-end; verify Type badges, live
  labor summary, PENDING earning appears for the installer after finalize,
  and invoice totals are unchanged.
