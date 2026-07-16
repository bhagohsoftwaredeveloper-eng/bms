# Order-Level Discount — Design

**Date:** 2026-07-16
**Status:** Approved

## Problem

The Discount field sits in Step 1 (Client & Project) next to Sale Price and only
discounts the software sale price (`softwareTotal = salePrice − discountAmt`).
Materials are never discounted, and the field's placement implies it belongs to
the software line. The user wants one overall discount applied to the whole
order, edited from the Order Summary card.

## Decision

Make the discount order-level:

```
subtotal    = salePrice + materialsTotal
discountAmt = discountType === 'PERCENTAGE' ? subtotal × discount / 100 : discount
grandTotal  = max(0, subtotal − discountAmt)
```

Percentage discounts are computed on the full subtotal (software + materials).

## Changes

1. **Step 1 (Client & Project)** — remove the Discount field entirely.
2. **Order Summary sidebar** (`admin-web/src/pages/JobOrderPage.tsx`) — add an
   editable discount input with the ₱/% selector inside the summary card, so it
   is visible/editable on every wizard step. Row order: System/Software →
   Materials → Subtotal → Discount (−, green) → Grand Total. Remove the
   "Software net" row (software is no longer discounted individually).
3. **Backend** (`src/job-order-pricing.util.ts` `computeGrandTotal`) — mirror
   the new formula exactly so payment balances match the printed invoice.
   Update `job-order-pricing.util.spec.ts`. Callers (`payments.service.ts`,
   `financial-reports.service.ts`) keep the same signature — no changes.
4. **Print/PDF template** (`PrintTemplate` in `JobOrderPage.tsx`) — drop the
   Discount and Net columns from the System/Software table; render Subtotal →
   Discount → Grand Total in the totals section instead.

## Not changing

- **DB schema** — `discount` and `discountType` stay on `JobOrder` as-is; only
  the math and UI placement change.

## Known side effect

Totals are computed on the fly, so existing JOs with a **PERCENTAGE** discount
will show a larger discount amount (base now includes materials). Fixed-₱
discounts are unchanged except the clamp-at-zero now applies to the whole
order rather than just the software line. Accepted by the user.
