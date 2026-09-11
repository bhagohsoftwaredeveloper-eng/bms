# License / NENPOS Client — Secure Void & Cross-Tab Transfer

## Problem

Admin staff sometimes enter a client/license record in the wrong place — e.g. a
NENPOS-line client gets typed into the main **Bhagoh Licenses** tab (backed by
the `Client`/`License` tables) instead of the **NENPOS Clients** tab (backed by
the standalone `NenposClient` table), or vice versa. Today there is no way to
correct this:

- There is no delete endpoint for an individual `License` at all (only a
  bulk "Reset Data" wipe of the whole module).
- `NenposClient` has a plain `DELETE /nenpos-clients/:id` with only role-based
  access — no re-authentication, no confirmation, no audit trail beyond the
  generic interceptor log, and no way to recover from an accidental click.
- Moving a record from one tab to the other means retyping everything by hand.

This spec adds two capabilities, available to `SUPER_ADMIN` only, on both the
Bhagoh Licenses and NENPOS Clients tabs:

1. **Secure Void** — a protected, reversible-in-the-database "soft delete" for
   a wrongly-entered record.
2. **Transfer** — move a record's data from one tab's table to the other's,
   voiding the source record as a side effect.

## Non-goals (explicit scope cuts)

- No in-app "Restore/Undo" button. Voided rows keep their data in the
  database and can be un-voided by a developer directly if truly needed, but
  there's no self-service restore UI in this iteration.
- No bulk/multi-select void or transfer — one record at a time.
- NENPOS → Bhagoh transfer requires the target `Client` to already exist
  (matched by business name); this feature does not create a `Client` inline.
- No change to the existing bulk "Reset Data" flow.

## Data model changes (Prisma)

Add to `License`:

```prisma
voidedAt                    DateTime? @map("voided_at")
voidedById                  String?   @map("voided_by_id")
voidReason                  String?   @map("void_reason") @db.Text
transferredToNenposClientId String?   @map("transferred_to_nenpos_client_id")

voidedBy User? @relation("LicenseVoidedBy", fields: [voidedById], references: [id])
```

Add to `NenposClient`:

```prisma
voidedAt               DateTime? @map("voided_at")
voidedById             String?   @map("voided_by_id")
voidReason             String?   @map("void_reason") @db.Text
transferredToLicenseId String?   @map("transferred_to_license_id")

voidedBy User? @relation("NenposClientVoidedBy", fields: [voidedById], references: [id])
```

`voidedAt` set = the record is inactive and hidden from the default list.
Whether the matching `transferredTo*Id` is also set distinguishes *why*:

- `voidedAt` set, `transferredTo*Id` null → plain void (deleted-by-mistake).
- `voidedAt` set, `transferredTo*Id` set → transferred away; the UI can link
  to the destination record.

Both `findAll` queries default to `WHERE voidedAt IS NULL`; a new
`includeVoided=true` query param returns everything (used by the "Show
voided/transferred" toggle described below).

A migration adds these columns; no existing enum (`LicenseStatus`,
`ClientStatus`) is touched, so no existing status-driven logic (activation
checks, expiry checks, etc.) is affected.

## Backend

### Shared password re-check

Both new "void" flows and the "transfer" flow require the acting admin to
re-enter their own login password, verified with `bcrypt.compare` against
their `User.passwordHash` — the same check already used by
`ResetService.reset()` in `src/reset.service.ts:158-165`. This is added as a
small reusable method (e.g. `AuthService.verifyPassword(userId, password)`)
called from the new service methods; existing callers are not touched.

### Endpoints (all `@Roles(UserRole.SUPER_ADMIN)`)

- `POST /licenses/:id/void`
  Body: `{ password, confirmName, reason? }`
  - Verifies password.
  - Loads the license with its `client`; rejects if already voided.
  - Rejects (400) if `confirmName.trim()` !== `client.businessName.trim()`.
  - Sets `voidedAt = now()`, `voidedById = userId`, `voidReason = reason`.
  - Returns the updated license.

- `POST /licenses/:id/transfer-to-nenpos`
  Body: `{ password, confirmName, installer?, notes? }`
  - Verifies password + `confirmName` the same way as void.
  - In one `$transaction`:
    - Creates a `NenposClient` row: `clientId` = `client.clientCode`,
      `clientName` = `client.businessName`, `license` = `license.licenseKey`,
      `startDate` = `license.activationDate`, `expiryDate` =
      `license.expirationDate`, `address` = `client.address`, `installer`,
      `notes`, `status` mapped from `LicenseStatus` (`ACTIVATED` → `"ACTIVE"`,
      `EXPIRED` → `"EXPIRED"`, `SUSPENDED`/`PENDING` → `"ACTIVE"` as a
      reasonable default admins can edit afterward).
    - Voids the source license with `transferredToNenposClientId` set to the
      new row's id.
  - Returns `{ license, nenposClient }`.

- `POST /nenpos-clients/:id/void`
  Body: `{ password, confirmName, reason?, transferredToLicenseId? }`
  - Same password + name check (`confirmName` vs `clientName`).
  - If `transferredToLicenseId` is provided (only ever set internally by the
    admin-web transfer flow described below), stores it alongside `voidedAt`
    so the record shows as "Transferred" rather than plain "Voided".
  - This single endpoint backs both the standalone Void action and the
    finishing step of a NENPOS → Bhagoh transfer.

NENPOS → Bhagoh does **not** get a dedicated transfer endpoint. The existing
`POST /licenses` (`GenerateLicenseDto`) is reused as-is; only the admin-web
form changes (pre-fill), described below.

### Audit trail

`AuditLogInterceptor` (`src/audit-log.interceptor.ts`) already auto-logs
every mutating request and scrubs `password` from the metadata. Its
`deriveActionName` gets three more special cases (alongside the existing
`/pin-agreement` one) so the log reads meaningfully instead of falling back
to the generic "Created License":

- `POST /licenses/:id/void` → `"Voided License"`
- `POST /licenses/:id/transfer-to-nenpos` → `"Transferred License to NENPOS"`
- `POST /nenpos-clients/:id/void` → `"Voided NENPOS Client"` (or
  `"Transferred NENPOS Client to License"` when `transferredToLicenseId` is
  in the body)

## Frontend (admin-web, `LicensesPage.tsx`)

Visible only to `SUPER_ADMIN` (existing `useAuthStore` role check already
gates other sensitive actions on this page, e.g. `isDeveloper` checks).

**Bhagoh Licenses tab** — each row gets two new actions:

- **Void** — opens a `Dialog` with: optional reason textarea, password
  input, a text input labelled "Type `{businessName}` to confirm", and a red
  "Void License" submit button (disabled until both password and the exact
  name are filled in) — mirrors the existing Reset-tab pattern in
  `SettingsPage.tsx:614-675` (password + typed confirmation), except the
  confirmation word is the client's own business name instead of a fixed
  word like `RESET`.
- **Transfer to NENPOS** — opens a `Dialog` previewing the fields that will
  be copied (business name, license key, install/expiry dates), plus
  optional Installer/Notes inputs (NENPOS-only fields with no License
  equivalent), then the same password + confirm-name inputs. On success,
  shows a toast/message linking to the new row in the NENPOS Clients tab;
  the source row now shows a "Transferred to NENPOS" badge instead of
  disappearing outright (only visible when "Show voided/transferred" is on).

**NENPOS Clients tab** — each row gets:

- **Void** — identical pattern, confirming against `clientName`.
- **Transfer to Bhagoh License** — opens the *existing* "Add License" dialog
  (`LicensesPage.tsx:774-854`) pre-filled: `licenseKey` from
  `NenposClient.license` (if present), and `clientId` pre-selected if an
  existing `Client.businessName` case-insensitively matches
  `NenposClient.clientName`. If no match is found, the client dropdown is
  left blank with a note: "No matching client found — create it on the
  Clients page first, then retry." The admin still must pick a Software
  Product (no NENPOS equivalent exists) and complete any other required
  fields.

  The Add-License dialog has no password step today. When it is opened via
  "Transfer to Bhagoh License" (as opposed to the plain "Add License"
  button), it gains one extra step before the final submit: a password
  input and a "type `{clientName}` to confirm" input, matching the Void
  dialog's pattern. Only once both are filled in does "Save license" become
  enabled. After `generateLicense` succeeds, the frontend automatically
  calls `POST /nenpos-clients/:id/void` with `transferredToLicenseId` set to
  the new license's id, reusing the same password/confirm-name values
  already collected — no second prompt.

**Both tabs** get a "Show voided/transferred" toggle (checkbox above the
table) that adds `includeVoided=true` to the list query. When on, voided
rows render greyed-out with a badge ("Voided" or "Transferred to NENPOS" /
"Transferred to Bhagoh License" — the latter two link to the destination
record) and no further actions.

## Error handling

- Wrong password → 401, dialog shows "Incorrect password — nothing was
  changed."
- `confirmName` mismatch → 400, dialog shows "Name doesn't match — nothing
  was changed."
- Attempting to void/transfer an already-voided record → 400, "This record
  was already voided/transferred."
- Transfer-to-NENPOS or the NENPOS-side void-with-link runs inside a DB
  transaction so a failure partway through leaves neither side changed.

## Testing

- Unit tests for `LicensesService.void` / `.transferToNenpos` and
  `NenposClientsService.void`: wrong password rejected, name-mismatch
  rejected, already-voided rejected, successful void sets the right fields,
  successful transfer creates the destination row and links both records
  inside one transaction.
- Controller tests confirming all three endpoints are `SUPER_ADMIN`-only.
- `AuditLogInterceptor` test confirming the three new action names are
  derived correctly and `password` is still scrubbed.
- Admin-web: manual verification per the golden path (void a test license,
  transfer a test license to NENPOS and back) since this is UI-driven.
