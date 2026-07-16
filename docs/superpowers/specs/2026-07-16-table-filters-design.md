# Table Search & Filters — Design

**Date:** 2026-07-16
**Status:** Approved (listing tables scope)

## Problem

Almost every listing table in admin-web (Clients, Jobs, Job Orders, Inventory,
Products, Users, Earnings, Withdrawals, Audit Logs, Download Leads, Financial
Reports) has no search or filtering; only Licenses has its own search box.

## Design

### Reusable component — `admin-web/src/components/TableToolbar.tsx`

One flex-row toolbar rendered above a table:

- **Search input** (always) — controlled text input, `className="input"`,
  with a placeholder describing the searched columns.
- **Select filters** (optional) — array of `{ value, onChange, options:
  { value, label }[] }`; each renders as a `select.input`. First option is
  the "All …" reset.
- **Date range** (optional) — From/To date inputs (same labeled pattern as
  Financial Reports) with `{ from, to, onFrom, onTo }`.

The component is purely presentational; each page owns its filter state and
applies a client-side `.filter()` over its already-loaded rows. Search is
case-insensitive substring over the fields shown in that table's columns.
Date ranges are inclusive (`to` covers the whole day). Empty-result rows show
the table's existing "no data" row (or "No matches." where none exists).

### Wiring per page (filters match visible columns)

| Page / table | Search over | Selects | Date range |
|---|---|---|---|
| ClientsPage | business name, owner, code, contact, address | — | — |
| JobsPage (both lists) | client, installer, type | status | scheduled date |
| JobOrdersPage (project JO list) | JO #, client | status | created date |
| InventoryPage — items | name, SKU, category | — | — |
| InventoryPage — movements | item, reason/ref | movement type | movement date |
| ProductsPage | product name, version | — | — |
| UsersPage | name, email | role | — |
| EarningsPage | installer, JO #, note | status | earned date |
| WithdrawalsPage | installer, reference | status | requested date |
| AuditLogsPage | action, actor, details | — | date |
| DownloadLeadsPage (both tables) | name, company, email, phone | status | created date |
| FinancialReportsPage — Outstanding | client name | — | — |

Skipped: dashboard summary mini-tables, JO detail line items / order summary /
print tables, KPI settings & Settings config tables, Licenses (already has
search). Pagination (where present) applies after filtering and resets to
page 1 when filters change.

## Not changing

Backend endpoints, data fetching, table columns, existing Licenses search.
