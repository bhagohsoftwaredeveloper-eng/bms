# JO Detail Header Cleanup — Document Type from Tab — Design

**Date:** 2026-07-15
**Status:** Approved

## Goal

Remove the document-type dropdown from the JO detail page header. The
document type now comes from the list page's active tab at creation time,
and Print/Download use the saved assignment.

## Behavior

1. **Create inherits the active tab.** "Create Project JO" on the list page
   passes the active tab as a query param (`/job-orders/:jobId?doc=QUOTATION`).
   A new (unsaved) JO initializes its `docType` from that param
   (validated against the four enum values; default `JOB_ORDER`).
2. **Header dropdown removed.** The `docType` state remains (it drives the
   print template, filename prefix, and the persisted field) but has no
   always-visible selector.
3. **Move between tabs.** The detail page subtitle shows the current document
   type label next to the JO number; a small "Change" button opens a Dialog
   with the four types as a radio list + Save. Saving persists via the normal
   upsert (keeping the JO's current status) and refreshes queries.
4. Saved JOs keep initializing `docType` from the record (unchanged).

## Out of scope

- Backend changes (none needed — `docType` persistence shipped earlier today).
- List-row move actions.

## Testing

Frontend type-check + manual: create from Quotation tab → lands in Quotation
tab; Change → Sales Invoice moves it; Print/Download show the right letterhead
and file prefix.
