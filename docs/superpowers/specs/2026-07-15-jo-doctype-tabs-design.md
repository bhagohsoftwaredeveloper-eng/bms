# Project JO Document-Type Tabs — Design

**Date:** 2026-07-15
**Status:** Approved

## Goal

Add Job Order / Quotation / Sales Invoice / Official Receipt tabs to the
Project Job Order list page, with each job order manually assigned to one
document type from the JO detail page.

## Decisions

- **Manual assignment, persisted on the JO** (chosen over lifecycle
  auto-derivation): the existing document-type dropdown on the detail page —
  currently print-only — becomes the saved assignment.
- One JO belongs to exactly one tab; changing the dropdown and saving moves it.
- Default `JOB_ORDER`, so all existing rows land on the Job Order tab.

## Data model

```prisma
enum DocType {
  JOB_ORDER
  QUOTATION
  INVOICE
  RECEIPT
}

model JobOrder {
  docType DocType @default(JOB_ORDER) @map("doc_type")
  // ...existing fields unchanged
}
```

Migration is hand-applied (`prisma db execute` + `migrate resolve`) because of
the pre-existing `notifications` FK drift that blocks `prisma migrate dev`.

## Backend

- `UpsertJobOrderDto`: optional `@IsEnum(DocType) docType`.
- `JobOrdersService.upsert`: persist `docType: dto.docType ?? 'JOB_ORDER'`.
- No other behavior changes (labor earnings, payments, and stock logic untouched).

## Frontend (admin-web)

- `types.ts`: `export type DocumentType = 'JOB_ORDER' | 'QUOTATION' | 'INVOICE' | 'RECEIPT';`
  and `JobOrder.docType: DocumentType`.
- **JobOrderPage:** the existing `docType` state (print selector) initializes
  from the saved JO and is included in the upsert payload. Saving (Save Draft /
  Finalize / Print / Download — the last two already save first) persists the
  assignment.
- **JobOrdersPage:** four `TabButton` tabs — Job Order, Quotation, Sales
  Invoice, Official Receipt — each with a count badge; table filtered by the
  active tab's docType. "Create Project JO" button and the Software/CCTV/Signage
  Type column stay as-is. Default active tab: Job Order.

## Out of scope

- Auto-deriving the document type from status/payments.
- An "All" tab (can be added later if asked).
- Print template changes (it already renders per docType).

## Testing

- Backend compile + existing suites (no new pure logic worth a unit test —
  the change is a persisted enum passthrough).
- Manual: assign a JO to Quotation on the detail page, save, confirm it moves
  to the Quotation tab; counts update; existing JOs appear under Job Order.
