# Developer Portal — Floating Task Timer

**Date:** 2026-07-06
**Status:** Approved design, pending spec review

## Goal

Give developers a persistent, non-blocking timer widget while a dev-project
task is running. The widget floats above the app on every page, shows the
live elapsed time, and offers Stop — the developer keeps full use of the
system (no locked/modal dialog).

## Decisions made during brainstorming

- **One active timer per developer.** Starting a new task **auto-stops** the
  currently running one (time saved), then starts the new one — no error, no
  confirm dialog.
- **Draggable floating card** (not fixed-corner, not pill-only): drag handle,
  reposition anywhere; position and minimized state remembered in
  `localStorage`. Default position bottom-right.
- Non-modal: `position: fixed`, never blocks interaction with the page.

## Backend changes (`dev-projects`)

### `DevProjectsService.start(id, user)` — auto-stop then start
Before starting project `id`, find any other `IN_PROGRESS` project owned by
the same developer and stop it inside the same transaction (close its open
session via the existing `closeOpenSession` logic, accumulate `totalMinutes`,
set status `PENDING`, clear `startedAt`), then start the requested project
(create session, set `IN_PROGRESS` + `startedAt`). The current
"This project is already being worked on" error is removed for the
cross-project case; starting a project that is itself already running remains
a no-op error. COMPLETED projects still cannot be started.

### New endpoint `GET /dev-projects/active`
Returns the current user's running project or `null`:

```json
{ "id": "...", "name": "...", "startedAt": "2026-07-06T08:00:00Z", "totalMinutes": 340 }
```

- Roles: DEVELOPER (own project). Admin roles get `null` (they don't run timers).
- Implemented as `findFirst({ where: { developerId: user.id, status: 'IN_PROGRESS' } })`
  with a light select — cheap enough for the widget to poll/refetch.
- Route must be declared BEFORE `@Get(':id')` in the controller so `active`
  is not captured as an id.

## Frontend — `RunningTimerWidget`

New component `admin-web/src/components/RunningTimerWidget.tsx`, rendered
once in `AdminLayout` (inside the authenticated shell, outside the routed
`<Outlet/>`), so it persists across all routes.

### Behavior
- Queries `['dev-active']` → `GET /dev-projects/active`; renders nothing when
  the result is `null` (admins, or no running task). `refetchOnWindowFocus: true`.
- Shows: drag handle (⠿), project name, live `HH:MM:SS` ticking every second
  computed client-side from `startedAt` (`totalMinutes` shown as subtitle
  "total tracked"), a **Stop** button, and a **minimize** toggle.
- Minimized state: a small pill showing `● HH:MM:SS`; click expands.
- **Stop** → `POST /dev-projects/:id/stop` → invalidate `['dev-active']` and
  `['dev-projects']` → widget disappears.
- Dragging: pointer-events based (pointerdown on handle, move, up), position
  clamped to the viewport, stored in `localStorage`
  (`dev-timer-pos` = `{x, y}`, `dev-timer-min` = boolean). Default
  bottom-right. On viewport resize, clamp back into view.
- Styling: reuse `.card` glass styling with a solid-enough background and
  `z-index` above content but below dialog overlays (dialogs use 1000; widget
  uses 900).

### Sync with DevProjectsPage
Start/stop mutations on `DevProjectsPage` additionally invalidate
`['dev-active']` so the widget appears/disappears immediately. The widget's
stop invalidates `['dev-projects']` so the page's list refreshes.

## Error handling
- Widget Stop failure: show inline error text in the card, keep the widget.
- `GET /dev-projects/active` failure: treat as `null` (hide widget silently).

## Out of scope
- Multiple concurrent timers (explicitly rejected — one active per developer).
- Mobile app widget.
- Idle detection / auto-pause.

## Verification (manual smoke — project has no test suite)
1. As a DEVELOPER: start a task on Dev Projects → widget appears; navigate to
   other pages → widget persists and ticks.
2. Drag it, minimize it, refresh the page → position/minimized state and
   elapsed time survive (elapsed derives from server `startedAt`).
3. Start a different task while one runs → old one auto-stops (its minutes
   accumulate), new one runs; widget switches to the new project.
4. Stop from the widget → widget disappears; Dev Projects page shows updated
   totals; session list has the closed session.
5. As SUPER_ADMIN: no widget ever appears.
