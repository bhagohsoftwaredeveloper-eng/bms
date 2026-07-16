# Standalone Quotations — Design

**Date:** 2026-07-16
**Status:** Approved (all 3 parts)

## Problem

Quotations can only be created through the Project JO flow, which forces
selecting an existing installation job. A prospect asking for a quote has no
installation yet. The schema already allows it (`JobOrder.jobId` is nullable,
optional in the DTO) — only the UI flow and upsert semantics block it.

## Design

### Backend

1. **`UpsertJobOrderDto`** gains optional `id`. `JobOrdersService.upsert`
   resolves the existing row by `id` first, then by `jobId` (unchanged
   behavior for job-bound orders). An `id` that matches nothing throws 404 —
   never silently creates a duplicate.
2. **Convert endpoint** — `POST /job-orders/:id/convert` with
   `{ scheduleDate: ISO date, installerId?: string }` (new
   `ConvertJobOrderDto`). In one transaction: verify the JO exists and has no
   job yet (400 otherwise), create a `Job` for the JO's client with the given
   schedule/installer, link it, and set `docType` to `JOB_ORDER`. Returns the
   updated JO (full include). Same roles as upsert.
3. Service spec covers: upsert-by-id resolution, convert happy path, convert
   rejects an already-linked JO.

### Frontend

1. **Route** — `/job-orders/order/:joId` renders the same `JobOrderPage`;
   `joId === 'new'` starts a blank standalone order (docType from `?doc=`,
   default QUOTATION). Standalone mode (`no jobId param`): parent-job query
   and banner are skipped (banner already renders only when the job loads),
   saves post `id` instead of `jobId`, and the first save navigates (replace)
   to `/job-orders/order/<new id>`.
2. **Convert to Job Order** — header button on a saved standalone order:
   dialog asking Schedule date (required) + Installer (optional, from
   `/users?role=INSTALLER`), calls the convert endpoint, then navigates to
   `/job-orders/<jobId>`.
3. **Entry points** —
   - Dashboard Quick Actions: “+ New Quotation” →
     `/job-orders/order/new?doc=QUOTATION`.
   - Project JO list, Quotation tab: create button becomes “Create Quotation”
     going straight to the standalone flow (other tabs keep the
     pick-installation dialog).
   - List/dashboard rows with no `jobId` open `/job-orders/order/:id`
     (dashboard rows currently do nothing for them).

### Unchanged

DB schema (no migration), payments (already keyed by JO id), print/PDF,
finalize rules (CCTV/Signage still require an installer, so those finalize
after conversion).
