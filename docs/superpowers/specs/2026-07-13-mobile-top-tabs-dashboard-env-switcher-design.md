# Beulah Field Mobile — Top Tabs, Shared Dashboard & Env Switcher — Design

**Date:** 2026-07-13
**Status:** Approved (pending spec review)
**Area:** `mobile/` (Expo Router app)

## Problem

Three changes to the Beulah Field mobile app:

1. **Navigation is at the bottom.** The app uses an `expo-router` bottom `Tabs` bar.
   The owner wants the menu/tabs at the **top** of the screen.
2. **Dashboard is admin-only.** Installers (field staff) never see a dashboard — only
   My Jobs, Earnings, Profile. The owner wants a dashboard visible to **both** admin and
   installer, each showing role-appropriate stats.
3. **No easy way to point the app at a local backend.** Production builds are pinned to
   the deployed (Tailscale) backend via `eas.json` / `app.json`. When testing withdrawal
   requests, the owner wants them to hit the **local** backend, not prod — without
   rebuilding each time.

## Scope

- Replace the bottom tab bar with a **top** tab bar (swipeable), keeping the existing
  purple header and role-based tab filtering.
- Make the Dashboard visible to installers with **installer-specific stats**; keep the
  existing admin stats for admins.
- Add an **in-app backend switcher** (Local ↔ Prod), controlled by SUPER_ADMIN only,
  persisted per-device, that switching applies app-wide (including for installers who
  later log in on the same device).

Out of scope: changing any backend endpoints; per-request backend routing (the whole app
targets one backend at a time); changing the admin dashboard's existing stats.

## Current state (verified)

- `mobile/app/(tabs)/_layout.tsx` — `expo-router` bottom `Tabs`; role gating via
  `href: isAdmin ? undefined : null`. `isAdmin = role === 'SUPER_ADMIN' || 'ADMIN_STAFF'`.
- `mobile/app/(tabs)/dashboard.tsx` — admin-only; queries `/clients`, `/licenses`,
  `/jobs`, `/withdrawals` (admin-scoped; would 403 for installers).
- `mobile/app/(tabs)/earnings.tsx` — installer withdrawal request form; already uses
  `/withdrawals/balance`, `/earnings?mine=true`, `/withdrawals?mine=true`.
- `mobile/app/(tabs)/index.tsx` — My Jobs; already uses `/jobs?mine=true`. Active statuses:
  `ASSIGNED`, `ON_GOING`, `WAITING_ACTIVATION`.
- `mobile/app/(tabs)/profile.tsx` — simple profile + Sign Out.
- `mobile/src/api.ts` — `API_URL` is a module-load-time `const` resolved from
  `EXPO_PUBLIC_API_URL` → `Constants.expoConfig.extra.apiUrl` → emulator default. Used by
  `axios.create({ baseURL })`, `refreshAccessToken` (`${API_URL}/auth/refresh`), and
  `fileUrl`.
- Backend URLs today: local `http://192.168.1.246:3001/api` (`.env`), prod
  `https://0rex-server.tail7dcc9b.ts.net/api` (`app.json` extra + `eas.json` build env).

## 1. Navigation → Top tab bar

**Approach:** Material Top Tabs wired into expo-router.

- Add deps `@react-navigation/material-top-tabs` and `react-native-pager-view`.
- In `mobile/app/(tabs)/_layout.tsx`, build a `Tabs` navigator with
  `withLayoutContext(createMaterialTopTabNavigator().Navigator)` (the documented
  expo-router pattern). Render the tab bar directly beneath the existing purple header
  (`tabBarPosition: 'top'` is inherent to material top tabs).
- Keep the current styling language: active tint `#4f46e5`, inactive `#9ca3af`, emoji
  icons + labels. Header stays purple (`#4f46e5`, white title).
- **Role gating unchanged in spirit:** keep hiding screens by role using the same
  `href: condition ? undefined : null` option per screen (expo-router honors `href` across
  layouts). If a screen still renders when `href` is null under the custom navigator,
  fall back to conditionally rendering the `<Tabs.Screen>` entries by role.
- Resulting tab sets:
  - **Installer:** Dashboard · My Jobs · Earnings · Profile
  - **Admin (SUPER_ADMIN / ADMIN_STAFF):** Dashboard · Menu · Profile

**Why native material-top-tabs over a custom JS bar:** less code (standard library),
`react-native-pager-view` ships in the Expo SDK so it works in Expo Go / `expo start`
dev with no custom rebuild, and swipe navigation comes for free. Production APKs need a
rebuild for the new native module — normal for any release. A JS-only custom top bar was
considered (no rebuild, no native dep) but rejected: more custom code and no swipe.

**Build note:** the production APK must be rebuilt via EAS before top tabs appear in the
installed app; the current installed APK will not show them until rebuilt.

## 2. Dashboard → both admin and installer

`mobile/app/(tabs)/dashboard.tsx` branches on `isAdmin`, reusing the existing stat-card
grid and greeting.

- **Admin (unchanged):** Clients, Active Clients, Licenses, Active Licenses, Open Jobs,
  Pending Withdrawals (from `/clients`, `/licenses`, `/jobs`, `/withdrawals`).
- **Installer:** four stat cards from already-scoped endpoints (no 403):
  - **Available Balance** (₱) — `/withdrawals/balance` → `availableBalance`.
  - **Open Jobs** — `/jobs?mine=true`, count where status ∈ {`ASSIGNED`, `ON_GOING`,
    `WAITING_ACTIVATION`}.
  - **Completed Jobs** — same query, count where status ∉ the active set.
  - **Pending Withdrawals** — `/withdrawals?mine=true`, count where `status === 'PENDING'`.
  - Balance rendered with the peso formatter; other cards are counts. Same
    refresh-on-focus + pull-to-refresh behavior as today.

The dashboard `href` gating in the layout changes from admin-only to **everyone**.

## 3. In-app backend switcher (Local ↔ Prod)

### api.ts (dynamic base URL)

- Replace the `const API_URL` with a mutable module variable `currentApiUrl` plus:
  - `getApiUrl(): string` — used by `fileUrl` and `refreshAccessToken`.
  - `setApiBaseUrl(url: string)` — sets `currentApiUrl` and `api.defaults.baseURL`.
- Define two named presets:
  - `PROD_API_URL` — the existing build-time resolution
    (`EXPO_PUBLIC_API_URL` → `extra.apiUrl` → default).
  - `LOCAL_API_URL` default `http://192.168.1.246:3001/api` (editable at runtime).
- Persist selection in SecureStore: `beulah_api_env` (`'local' | 'prod'`) and
  `beulah_local_url` (the editable local URL).
- **Boot:** in auth initialization (before the first authed request), read
  `beulah_api_env`/`beulah_local_url` and call `setApiBaseUrl(...)`. If nothing stored,
  default to Prod (build-time URL) — preserves current production behavior.

### UI (Profile → Server section)

- New **"Server"** section in `mobile/app/(tabs)/profile.tsx`, rendered **only when
  `user.role === 'SUPER_ADMIN'`**.
- Contents: segmented toggle **Local | Prod**; when Local is selected, an editable text
  field for the Local URL (prefilled from `beulah_local_url` / default); an
  **"Apply & re-login"** button; a line showing the currently active backend.
- **Applying a switch:** persist env + local URL, call `setApiBaseUrl`, then **clear
  tokens and redirect to `/login`** (a JWT from one backend is invalid on the other). A
  short warning explains the forced re-login.

### Device-wide effect

The setting is stored per-device, not per-user. A SUPER_ADMIN sets it to Local and signs
out; an installer then logs into the local backend on the same device. Installers cannot
see or change the switcher, but they use whatever backend was last selected.

## Error handling

- Dashboard installer queries: on failure, keep previous stats (matches current admin
  dashboard behavior — silent catch, cards retain last values).
- Switcher: if the entered Local URL is empty/malformed, block Apply with an inline
  validation message; do not clear tokens until a valid URL is set.

## Testing

- **Manual (dev / Expo Go):**
  - Top tabs render at the top and swipe between screens; role-correct tab sets for an
    installer vs an admin account.
  - Installer login shows the Dashboard tab with the four installer stats populated from
    the local backend; admin login shows the unchanged admin stats.
  - As SUPER_ADMIN, the Server section appears; as installer it does not. Switching to
    Local + Apply forces re-login; a withdrawal request then lands in the **local**
    backend DB (verify the row locally, not on prod). Switching back to Prod restores
    prod targeting.
- **Type/lint:** `tsc`/expo lint clean for the changed files.
- **Production build:** confirm an EAS `production-apk` build boots with top tabs (native
  `pager-view`) and defaults to Prod when no switch has been made.
