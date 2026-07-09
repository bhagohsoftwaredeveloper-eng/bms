# Beulah Landing Page — Design Spec (2026-07-09)

## Goal
A public front page for the Beulah monitoring system that showcases the product
(dashboard snapshot, feature grid, KPI spotlight, mobile app) and lets visitors
install the system: Android APK download, desktop PWA install, or open the web app.

## Decisions (agreed with owner)
- **Placement:** root `/` shows the landing page to unauthenticated visitors;
  authenticated users go straight to the dashboard. "Sign In" links to `/login`.
- **APK:** the production APK is pre-connected to the server (already true —
  API URL is baked in). Served from a `downloads/` folder on the server, NOT
  committed to git. Button links to `/downloads/beulah-field.apk`.
- **Desktop:** PWA install (web manifest + `beforeinstallprompt`), no Electron.
- **Snapshot:** mock dashboard visual with fake data — the page is public, so
  no real client names or revenue figures may appear.

## Components
1. `admin-web/src/pages/LandingPage.tsx` — single-page scroll:
   hero (brand, tagline, CTAs, mock dashboard snapshot), features grid
   (licenses, installation jobs w/ proof+GPS, earnings ₱, withdrawals,
   analytics, dev timer, inventory/job orders, audit logs, roles),
   KPI spotlight section, mobile app section, download section, footer.
2. `admin-web/src/App.tsx` — root route gate: guest → LandingPage,
   authed → existing protected dashboard. All other routes unchanged.
3. `src/app.module.ts` — second ServeStaticModule root serving
   `<cwd>/downloads` at `/downloads` (dir kept with .gitkeep); SPA fallback
   excludes `/downloads/{*path}`.
4. `admin-web/public/manifest.webmanifest` + 192/512 icons + index.html links.
   "Install on Desktop" button captures `beforeinstallprompt`; shows manual
   instructions when the prompt is unavailable.

## Non-goals
- No Electron build, no service worker (add later only if install prompt
  requires it), no real-data screenshots, no separate marketing host.

## Verification
Typecheck + vite build; manual: guest sees landing, authed sees dashboard,
`/downloads/beulah-field.apk` serves once a file is dropped in, PWA install
prompt appears in Chrome/Edge.
