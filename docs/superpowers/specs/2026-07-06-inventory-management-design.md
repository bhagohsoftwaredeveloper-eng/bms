# Inventory Management — Design Spec

**Date:** 2026-07-06
**Status:** Phase 1 approved for implementation

## Background

The job-order form has a hardcoded `PRESETS` array of "Quick Add" material buttons
(`admin-web/src/pages/JobOrderPage.tsx`). Each preset is `{ name, description }`; clicking one
adds a line item with `quantity: 1, unitPrice: 0`. The list cannot be edited without changing code.

Goal: turn this into a database-backed, UI-managed **Inventory** with stock tracking, managed under
**Settings → Inventory**, feeding the job-order Quick Add.

## Decisions (from brainstorming)

- **Full inventory + stock** (not just an editable name/description list).
- **Phased delivery.** Phase 1 now; Phase 2 later.
- **Stock deducts when a job order is marked COMPLETED / installed** (Phase 2).
- **Barcode** field per item; barcode scan-to-add in the job order (scanner = keyboard + Enter).

## Phase 1 scope (this spec)

Inventory catalog with manual stock, managed in Settings, feeding the Quick Add. **No automatic
deduction yet** — stock is adjusted manually in Phase 1.

### Data model — `InventoryItem` (Prisma)

| Field | Type | Notes |
|---|---|---|
| `id` | String uuid | PK |
| `name` | String | e.g. "Thermal Printer 80mm" |
| `description` | String? @db.Text | optional detail |
| `barcode` | String? @unique | optional; scan-to-add key |
| `unitPrice` | Decimal(12,2) default 0 | default price auto-filled on add |
| `stockQty` | Int default 0 | current available stock |
| `lowStockAlert` | Int default 0 | threshold; 0 = no alert |
| `sortOrder` | Int default 0 | Quick Add button order |
| `active` | Boolean default true | inactive = hidden from Quick Add, not deleted |
| `createdAt` / `updatedAt` | DateTime | standard |

Table map: `inventory_items`. Follows existing schema conventions (uuid ids, snake_case `@map`).

### Backend — `InventoryModule`

`InventoryService` + `InventoryController`, guarded by `JwtAuthGuard`.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/inventory` | any authenticated | list items (query `?all=true` includes inactive; default active only) |
| GET | `/inventory/barcode/:code` | any authenticated | look up one item by barcode (scan-to-add) |
| POST | `/inventory` | ADMIN, SUPER_ADMIN | create item |
| PATCH | `/inventory/:id` | ADMIN, SUPER_ADMIN | update name/desc/barcode/price/threshold/sortOrder/active |
| POST | `/inventory/:id/adjust` | ADMIN, SUPER_ADMIN | manual restock: body `{ delta: number }` (adds to stockQty; must not go below 0) |
| DELETE | `/inventory/:id` | ADMIN, SUPER_ADMIN | delete item |

DTOs use class-validator (project has global `ValidationPipe` with `whitelist + forbidNonWhitelisted`).
Barcode uniqueness enforced at DB + friendly 400 on conflict.

### Frontend

**Settings → new "Inventory" tab** (add to `TABS` in `SettingsPage.tsx`):
- Table: name, barcode, unit price, stock (row/badge turns **red when `stockQty <= lowStockAlert` and
  threshold > 0**), active toggle.
- Add-item form (name, description, barcode, price, initial stock, low-stock threshold).
- Per-row: edit, delete, and restock control (+/– `delta`).

**JobOrderPage:**
- Replace hardcoded `PRESETS` with `GET /inventory` (active items, sorted by `sortOrder`).
- Quick Add buttons render from inventory; label shows stock, e.g. `+ Thermal Printer 80mm (12)`.
- `addPreset` sets `unitPrice` from the item and stores `inventoryItemId` on the line item
  (kept in component state now; persisted in Phase 2).
- **Scan-to-add box**: a text input; on Enter, call `/inventory/barcode/:code`, add the matched item,
  clear the box. Unknown barcode → inline "not found" message.

### Out of scope (Phase 2)

- `JobOrderItem.inventoryItemId` column + persistence.
- Automatic stock decrement when `JobOrder.status` becomes `COMPLETED`; restore on
  cancel/revert/edit.
- Stock movement history (audit of every in/out with reason + who).
- Low-stock notifications.

## Testing (Phase 1)

- Backend: `InventoryService` unit tests — create, adjust (reject negative result), barcode lookup,
  duplicate-barcode rejection.
- Manual: manage items in Settings; confirm Quick Add in a job order reflects the list, prices, and
  stock labels; scan/enter a barcode adds the item.
