# Backup Upload & Restore — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)
**Area:** Settings → Database (Backups tab)

## Problem

Admins can create, download, and delete full database backups today, but there is
no way to **restore** one. Railway's `backups/` folder is ephemeral, so a downloaded
`.sql` is often the only surviving copy — yet it can't be brought back into the
system. We need to upload a previously-downloaded backup and restore from it, either
as a **full** database restore or a **per-module** restore of selected data.

## Scope

- Upload a full `.sql` backup file (the kind produced by the existing "Create backup")
  so it appears in the Backups list like any created backup.
- Restore any backup in the list, choosing either the **full database** or a set of
  **modules** (the same transactional modules the Reset feature exposes).
- `SUPER_ADMIN` only, gated by the admin's login password + a typed confirm word.

Out of scope: creating per-module backups (backups remain full dumps); auto-snapshot
before restore (explicitly declined — the UI instead reminds the admin to back up first).

## Constraints

- **No MySQL client binary on Railway.** Restore must run in-process via `mysql2`,
  never `mysql < file` (same `ENOENT` problem already solved for `mysqldump`).
- Backups can come from either the native `mysqldump.exe` (office PC) or the pure-JS
  `mysqldump` npm dumper (Railway). Both emit standard SQL with, per table:
  `DROP TABLE IF EXISTS \`t\`;` → `CREATE TABLE \`t\` …` → `INSERT INTO \`t\` …`,
  bracketed by `FOREIGN_KEY_CHECKS=0` … `=1`. Verified against the live schema.

## Approach (chosen)

**mysql2 in-process + table-block slicing.**

- Full restore: execute the entire `.sql` through a `mysql2` connection with
  `multipleStatements: true`. The dump's own preamble/epilogue handles FK checks.
- Module restore: slice the file into per-table blocks by cutting on each
  `^DROP TABLE IF EXISTS \`x\`;` line, keep only the selected modules' tables, and
  execute `preamble + selected blocks + epilogue`.

Rejected alternatives:
- **Temp-database load then copy** (`INSERT … SELECT` from a scratch DB): bulletproof
  but needs `CREATE DATABASE` privilege, loads the whole dump every time, more failure
  modes. Unneeded for the current DB size.
- **Shell out to `mysql`**: fails on Railway (no client binary).

## Backend

### Endpoints (BackupsController, SUPER_ADMIN)

- `POST /backups/upload` — multipart (`multer`, disk storage into `BACKUP_DIR`).
  Requires a `.sql` extension; sanitizes the client filename to conform to the existing
  `FILENAME_RE` (`/^[\w.-]+\.sql$/`) — strip unsafe characters, and on collision append
  a timestamp suffix so an upload never overwrites an existing backup. Size cap 200 MB.
  Rejects non-`.sql` with a clear message. On success the file appears in the existing
  `GET /backups` list. (`multer` ships with `@nestjs/platform-express`; no new dep.)
- `POST /backups/:filename/restore` — body `{ password: string, modules: 'all' | string[] }`.
  Verifies the caller's login password (same bcrypt check as `ResetService.reset`),
  then restores. Returns `{ scope, modules, tables: string[] }` summary.

### RestoreService (new)

Kept separate from `BackupsService` (create/list/download/delete) and `ResetService`.

- `parseDump(sql): { preamble: string; blocks: Map<tableName, string>; epilogue: string }`
  — pure function; splits on `^DROP TABLE IF EXISTS \`(\w+)\`;` boundaries. Everything
  before the first boundary is the preamble; everything belonging to a table (its
  DROP/CREATE/INSERT/LOCK/UNLOCK lines) up to the next boundary is that table's block;
  the FK-re-enable tail is the epilogue. Unit-testable in isolation.
- `MODULE_TABLES: Record<string, string[]>` — single source of truth mapping module id
  → real table names, matching the Reset modules exactly:
  - `jobs` → `jobs`, `installation_proofs`
  - `job-orders` → `job_orders`, `job_order_items`
  - `dev-projects` → `dev_projects`, `dev_project_sessions`, `dev_project_reports`, `dev_project_report_feedback`
  - `licenses` → `licenses`
  - `earnings` → `earnings`
  - `withdrawals` → `withdrawals`
  - `kpi` → `kpi_results`, `incentives`
  - `notifications` → `notifications`
  - `nenpos-clients` → `nenpos_clients`
  - `audit-logs` → `audit_logs`
- `restore(filename, modules)` — reads the file; for `'all'` runs the whole SQL, for a
  module list rebuilds `preamble + selected tables' blocks + epilogue`; opens a one-off
  `mysql2` connection from `DATABASE_URL` (`multipleStatements: true`), executes, closes.
  A module id with no matching block in the dump is skipped (reported), not fatal.

### Error handling

Surface the real MySQL error and the failing table/statement (mirrors the backup fix —
throw `InternalServerErrorException` with the actual reason, not a generic 500). The
frontend displays the server message.

### Dependency

Add `mysql2` as a direct dependency (already present transitively via `mysqldump`; the
`overrides` pin to `^3.11.5` keeps it patched).

## Frontend (Settings → Backups tab)

- **Upload:** "Upload backup" button beside "Create backup" → hidden
  `<input type="file" accept=".sql">`. POST multipart to `/backups/upload`, then
  invalidate the `['backups']` query. Disabled/spinner state while uploading; errors
  shown in the existing error banner.
- **Restore:** a danger-styled **Restore** button per backup row (with Download/Delete).
  Opens a dialog:
  - Scope radio: "Full database" vs "Selected modules".
  - When "Selected modules": checkboxes from `GET /backups/reset/modules` (reuse so
    labels/counts match Reset).
  - Password field + type `RESTORE` to confirm.
  - Confirm disabled until password + confirm word present and (module scope) ≥1 module.
  - Warnings: full restore overwrites the entire DB incl. users (may require re-login);
    module restore replaces those tables and can leave cross-module references
    inconsistent; reminder to create a backup first.
- On success: summary toast/line ("Full restore complete" / "Restored: Jobs, Earnings")
  and invalidate affected queries.

## Safety & edge cases

- **Not atomic:** MySQL auto-commits DDL, so a mid-run failure can't fully roll back.
  On failure, stop and report the failing table/statement. Dialog nudges a manual
  backup first.
- **FK integrity:** module restores preserve the dump's `FOREIGN_KEY_CHECKS=0/1`
  bracketing so ordering never breaks; cross-module dangling references remain the
  admin's accepted risk (warned in UI).
- **Upload validation:** `.sql` only, sanitized name, size cap; clear rejection message.
- **Lockout:** acting admin's JWT stays valid for the current session after a full
  restore; warning covers needing to re-login later.

## Testing

- **Unit:** `parseDump` (block boundaries, table→block map, preamble/epilogue split);
  `MODULE_TABLES` (every id resolves to real, existing tables).
- **E2E (local MySQL):** create a dump, mutate rows, restore a single module → assert
  only that module's rows revert; then a full restore → assert whole DB matches. Run
  the same way the backup fix was verified (compiled `dist`, real DB).
