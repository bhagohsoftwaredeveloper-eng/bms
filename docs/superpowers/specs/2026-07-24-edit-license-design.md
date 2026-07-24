# Edit License — Design Spec

**Date:** 2026-07-24
**Status:** Approved
**Builds on:** [Trial License](2026-07-24-trial-license-design.md)

## Problem

Real workflow: a client starts on a **trial**, then after a few days buys a real
license. Today the only way to record that is to **add a new license**, which is wrong —
the existing trial should be **edited** to carry the real provider key (trial → full).
Licenses are currently not editable at all (no PATCH endpoint, no Edit UI).

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Form | **General Edit License** — an Edit button on each license row, not a trial-only "convert". |
| Editable fields | **License key, Client, Product, Trial on/off + trial days**. Expiry is not directly editable. |
| Reverting to trial | **Not allowed once activated** — `isTrial` may only be set to `true` while status is `PENDING`. Trial → full is one-way for activated licenses. |
| Activation/token on edit | **Just update the record** — do not touch `status`, `licenseToken`, or `hardwareFingerprint`. The 3rd-party provider key governs the device's real licensing; this system's edit only corrects the record. |

## Design

### Backend

**New DTO** `src/update-license.dto.ts` — all fields optional:
`licenseKey?`, `clientId?`, `productId?`, `isTrial?`, `trialDays?` (same validators as
`GenerateLicenseDto`: `trialDays` int 1–365, `licenseKey` non-empty string).

**New service method** `LicensesService.update(id, dto)`:
1. Load the license (`findOne` → 404 if missing).
2. **Guard:** if `dto.isTrial === true` and the license status is not `PENDING`, throw
   `BadRequestException('An activated license cannot be changed back to a trial')`.
3. If `dto.licenseKey` is given and differs from the current key, ensure it is unique
   (a different license with that key → `ConflictException`).
4. Resolve `newIsTrial = dto.isTrial ?? existing.isTrial`.
   - Converting **trial → full** (`existing.isTrial === true && newIsTrial === false`):
     set `trialDays = null` and `expirationDate = null` (drops the trial window; the full
     license has no system-managed expiry).
   - `newIsTrial === true`: `trialDays = dto.trialDays ?? existing.trialDays ?? 30`.
5. Apply only the provided `licenseKey` / `clientId` / `productId` plus the trial fields
   above. Leave `status`, `licenseToken`, `hardwareFingerprint`, `activationDate` untouched.
6. Return the updated license with `client` + `product` included.

**New controller route** `PATCH /licenses/:id` (`@Roles(SUPER_ADMIN)`), distinct from the
existing `:id/activate` and `:id/suspend` routes.

### Frontend (`LicensesPage.tsx`)

- Add an **Edit** button in each license row's action group (admin roles, `!isDeveloper`),
  next to View.
- Reuse a dialog pre-filled from the row: `licenseKey`, `clientId`, `productId`, `isTrial`,
  `trialDays`. Client/product selects load their option lists (enable the `clients`/
  `products` queries when the edit dialog is open, same as the Add dialog).
- The **Full/Trial toggle is disabled** when `editingLicense.status !== 'PENDING'`, with a
  helper note: "Activated licenses can't be changed back to trial." (A license that is
  already full stays full; a PENDING trial can still be edited freely.)
- On save: `PATCH /licenses/:id` with the changed fields, then invalidate `['licenses']`.

### Testing

Extend `src/licenses.service.spec.ts`:
- `update` changes the license key (and rejects a key already used by another license).
- Converting trial → full clears `trialDays` and `expirationDate`.
- Guard: setting `isTrial: true` on a non-PENDING license throws `BadRequestException`.
- Setting `isTrial: true` on a PENDING license is allowed.

## Out of scope (YAGNI)

- Editing `expirationDate` directly, editing `status`, or re-signing/re-activating tokens
  on edit.
- Deleting licenses.
