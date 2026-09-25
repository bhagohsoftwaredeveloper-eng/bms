# Job Order: Multiple Computers, Per-Computer Package, Cloud Subscription

Date: 2026-09-25
Scope: SOFTWARE job orders only (CCTV / Signage unchanged).

## Problem

A client can run several computers/terminals (`Client.computerCount`), each needing a
different software package and its own materials. A job order today has a single
`productId`, a single `salePrice`, and one flat `items` list. There is also no way to
bill a monthly cloud subscription on the order.

## Requirements

1. A SOFTWARE job order holds one or more **computers**. Each computer has its own
   label, software product ("package"), price, and its own materials/Item Packages.
2. When the client has a declared `computerCount` (N), a new SOFTWARE job order opens
   with N computer cards ("Computer 1" … "Computer N"), each awaiting a product.
3. Each computer can enable a **monthly cloud subscription** (monthly rate × number of
   months). The total across computers is added to the order's total billing.
4. Existing job orders keep working unchanged.

## Data model (additive migration only, `prisma migrate deploy`)

New model `JobOrderUnit` (table `job_order_units`):

| field | type | notes |
|---|---|---|
| id | uuid | |
| jobOrderId | string | FK → JobOrder, `onDelete: Cascade` |
| label | string | e.g. "Front Counter"; default "Computer N" |
| sortOrder | int | |
| productId | string? | FK → SoftwareProduct |
| price | Decimal(12,2) | system price for this computer |
| cloudEnabled | boolean | default false |
| cloudMonthlyRate | Decimal(12,2)? | prefilled from product `maintenanceFee`, editable |
| cloudMonths | int? | months billed on this order (>= 1 when enabled) |

Changes to existing models:

- `JobOrderItem.unitId String?` — FK → JobOrderUnit, `onDelete: SetNull`. `null` = a
  general/shared item for the whole order.
- `JobOrder.cloudTotal Decimal(12,2) @default(0)` — server-computed
  `sum(cloudMonthlyRate × cloudMonths)` over cloud-enabled units.
- `JobOrder.productId` and `salePrice` stay. With units present the server sets
  `salePrice = sum(unit.price)` and `productId = first unit's productId` so KPIs and
  other legacy readers keep working.

Existing orders have no units; they render as one implicit computer built from
`productId` / `salePrice`, and become a real unit on next save. No data backfill.

## Pricing

`computeGrandTotal` (src/job-order-pricing.util.ts) gains an optional `cloudTotal`
argument (default 0):

```
subtotal   = salePrice + materialsTotal + cloudTotal
discount   = applied to subtotal (existing FIXED / PERCENTAGE behaviour)
grandTotal = max(0, subtotal - discount)
```

The admin-web `computeTotals()` mirror in JobOrderPage.tsx is updated identically. All
backend callers (payments, financial reports, earnings, KPIs) must pass
`jobOrder.cloudTotal` so the payment balance still matches the printed total.
The plan step enumerates callers via grep.

Assumption: the discount applies to the cloud subscription too (it is part of the
subtotal). Change only if the user says otherwise.

Server ignores client-supplied `salePrice` / `cloudTotal` when units exist and
recomputes them.

## API (`POST` upsert job order)

`UpsertJobOrderDto` adds:

```
units?: {
  key: string            // client-side id used to link items in this request
  label: string
  productId?: string
  price: number
  cloudEnabled?: boolean
  cloudMonthlyRate?: number
  cloudMonths?: number   // >= 1 when cloudEnabled
}[]
```

`JobOrderItemDto` adds `unitKey?: string`.

In the existing transaction: delete old items and units, create units, map
`unitKey → unitId`, create items. An item whose `unitKey` matches no unit → 400.
`units` is only honoured when `type = SOFTWARE`. `INCLUDE_FULL` includes
`units` (ordered by `sortOrder`). Inventory stock handling is unchanged (per item).

## Admin web: wizard (JobOrderPage.tsx)

**Step 1** (SOFTWARE): the single "System / Software" select becomes a list of
**Computer cards**: label, product select, price (auto-filled from product, editable),
"Cloud subscription" toggle revealing monthly rate (prefilled from
`maintenanceFee`) and months (default 1), and a remove button (min 1 computer).
"+ Add computer" appends a card. The `salePrice` input becomes a read-only
"Systems subtotal"; a "Cloud subscription" subtotal is shown beside it.

Prefill: for a **new** order, once a client is chosen, create
`client.computerCount` cards (min 1). Never overwrite an existing order's units. If an
existing order's unit count differs from the client's declared count, show a
non-blocking hint ("Client declares 3 computers; this order has 2").

**Step 2**: the items table is grouped per computer (header shows label, product,
computer subtotal) plus a "General" group for unit-less items. The search/scan box
gets an "Adding to: [computer ▾]" selector; added items and expanded Item Packages
are tagged with that computer's key. Totals panel shows systems, materials, cloud
subscription, discount, grand total.

## Print (PrintTemplate.tsx)

Header lists each computer with its product/version. Items grouped per computer with
subtotals. A cloud subscription line per computer ("Cloud subscription ₱X × N mo").
Totals block gains the cloud line. Agreement pages and payments are unchanged.

## Out of scope

- Mobile app job-order screens (they show totals only; first pass leaves them).
- Auto-generating licenses per computer.
- Recurring/renewal billing of the cloud subscription after the months billed here.
- Syncing units when `Client.computerCount` changes later (hint only).

## Testing

Backend (`job-orders.service.spec.ts`, pricing util spec):
- create/update with units: units persisted, `unitKey` mapped to `unitId`.
- `salePrice` = sum of unit prices; `cloudTotal` computed; client-supplied values ignored.
- unknown `unitKey` → 400; legacy payload without units still works.
- `computeGrandTotal` with and without `cloudTotal`; discount applies to it.

Admin web:
- unit-state helpers: prefill from `computerCount`, add/remove computer, add item to
  selected computer, totals with cloud.

Manual: create client with 2 computers → new JO shows 2 cards → pick different
products, enable cloud on one → totals, save, reload, print, add a payment and confirm
the balance matches the printed grand total.
