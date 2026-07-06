# Developer Floating Task Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A draggable, non-modal floating timer card that follows the developer across every admin-web page while a dev-project task runs, with live elapsed time and a Stop button; starting a new task auto-stops the previous one.

**Architecture:** Backend gains one query endpoint (`GET /dev-projects/active`) and an auto-stop rule inside the existing `start()` transaction. Frontend gains one self-contained component (`RunningTimerWidget`) mounted in `AdminLayout` so it persists across routes, synced with the Dev Projects page through shared TanStack Query keys (`['dev-active']`, `['dev-projects']`).

**Tech Stack:** NestJS + Prisma (MySQL) backend; React 18 + TanStack Query + axios (`api` from `admin-web/src/lib/api`) admin-web.

## Global Constraints

- One active timer per developer: `start()` auto-stops any other `IN_PROGRESS` project owned by the same developer, saving its time, in the same transaction (spec: no error, no confirm dialog).
- Widget is non-modal (`position: fixed`), draggable via a handle, minimizable to a pill; position (`dev-timer-pos` as `{x,y}`) and minimized state (`dev-timer-min`) persist in `localStorage`; default placement bottom-right.
- Widget z-index 900 (dialog overlays use 1000 — widget must sit below them).
- `GET /dev-projects/active` must be declared BEFORE `@Get(':id')` in the controller so `active` is not captured as an id.
- Admin roles calling `/dev-projects/active` get `null` (no widget); no 403.
- Elapsed time is computed client-side from server `startedAt` (survives refresh/navigation).
- Project has NO automated test suite (jest finds 0 specs). Verification per task = typecheck/build passing exactly as specified; final task is a manual smoke checklist. Do NOT add test files.
- Work on branch `dev-floating-timer` (already created). Commit after each task.

---

### Task 1: Backend — auto-stop on start + `GET /dev-projects/active`

**Files:**
- Modify: `src/dev-projects.service.ts:114-137` (the `start` method) and add a `findActive` method after `findOne` (around line 92)
- Modify: `src/dev-projects.controller.ts:49-59` (insert the `active` route between the `reviewers` route and `@Get(':id')`)

**Interfaces:**
- Consumes: existing `closeOpenSession(tx, project, now)` private helper (`src/dev-projects.service.ts:291`), `DevProjectStatus` from `@prisma/client`.
- Produces: `DevProjectsService.findActive(user: { id: string })` → `Promise<{ id: string; name: string; startedAt: Date | null; totalMinutes: number } | null>`; HTTP `GET /api/dev-projects/active` returning that object or `null`. Task 2's widget consumes this exact JSON shape.

- [ ] **Step 1: Rewrite `start()` with the auto-stop rule**

In `src/dev-projects.service.ts`, replace the entire existing `start` method (lines 114–137) with:

```typescript
  async start(id: string, user: { id: string; role: UserRole }) {
    const project = await this.findRaw(id);
    this.assertOwner(project, user);

    if (project.status === DevProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('This project is already being worked on');
    }
    if (project.status === DevProjectStatus.COMPLETED) {
      throw new ForbiddenException('This project is already completed');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // One active timer per developer: auto-stop any other running project
      // first, saving its tracked time, then start the requested one.
      const running = await tx.devProject.findFirst({
        where: {
          developerId: project.developerId,
          status: DevProjectStatus.IN_PROGRESS,
          id: { not: id },
        },
      });
      if (running) {
        const totalMinutes = await this.closeOpenSession(tx, running, now);
        await tx.devProject.update({
          where: { id: running.id },
          data: { status: DevProjectStatus.PENDING, startedAt: null, totalMinutes },
        });
      }

      await tx.devProjectSession.create({
        data: { projectId: id, startedAt: now },
      });
      await tx.devProject.update({
        where: { id },
        data: { status: DevProjectStatus.IN_PROGRESS, startedAt: now },
      });
    });

    return this.findOne(id, user);
  }
```

Notes: the auto-stop keys on `project.developerId` (not `user.id`) so a SUPER_ADMIN starting a project on a developer's behalf still stops that developer's other running task. Same-project restart and COMPLETED guards keep their existing errors.

- [ ] **Step 2: Add `findActive` to the service**

Immediately after the `findOne` method (after line 92), add:

```typescript
  /** The current user's running project, for the floating timer widget. */
  findActive(user: { id: string }) {
    return this.prisma.devProject.findFirst({
      where: { developerId: user.id, status: DevProjectStatus.IN_PROGRESS },
      select: { id: true, name: true, startedAt: true, totalMinutes: true },
    });
  }
```

(Admins are never a project's `developerId` — `assertDeveloper` enforces DEVELOPER role on assignment — so this naturally returns `null` for them.)

- [ ] **Step 3: Add the controller route BEFORE `@Get(':id')`**

In `src/dev-projects.controller.ts`, insert between the `listReviewers` method (ends line 53) and the `findOne` method (starts line 55):

```typescript
  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('active')
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.findActive(user);
  }
```

Admin roles are included so the widget's query returns `null` (200) instead of 403 for them.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/dev-projects.service.ts src/dev-projects.controller.ts
git commit -m "feat: auto-stop previous task on start; add GET /dev-projects/active"
```

---

### Task 2: Frontend — `RunningTimerWidget` + mount + query sync

**Files:**
- Create: `admin-web/src/components/RunningTimerWidget.tsx`
- Modify: `admin-web/src/layouts/AdminLayout.tsx` (import + render after `</main>`, line ~660)
- Modify: `admin-web/src/pages/DevProjectsPage.tsx:138` (the `invalidate` helper)

**Interfaces:**
- Consumes: `GET /dev-projects/active` from Task 1 returning `{ id, name, startedAt, totalMinutes } | null` (axios serializes a null body as `''` — the widget must treat falsy data as null); existing `POST /dev-projects/:id/stop`; `api` from `../lib/api`.
- Produces: `RunningTimerWidget` (named export, no props); shared query key `['dev-active']` that DevProjectsPage also invalidates.

- [ ] **Step 1: Create `admin-web/src/components/RunningTimerWidget.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ActiveTimer {
  id: string;
  name: string;
  startedAt: string;
  totalMinutes: number;
}

interface Pos {
  x: number;
  y: number;
}

const POS_KEY = 'dev-timer-pos';
const MIN_KEY = 'dev-timer-min';

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

function formatElapsed(startedAt: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

function formatTotal(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(m / 60)}h ${m % 60}m total tracked`;
}

/**
 * Floating, draggable, non-modal timer card shown on every page while the
 * current user has a running dev project. Position + minimized state persist
 * in localStorage. Never blocks interaction with the app (fixed, z-index 900,
 * below dialog overlays at 1000).
 */
export function RunningTimerWidget() {
  const qc = useQueryClient();
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const [minimized, setMinimized] = useState(() => localStorage.getItem(MIN_KEY) === '1');
  const [, setNow] = useState(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const activeQuery = useQuery({
    queryKey: ['dev-active'],
    // A null body arrives as '' through axios — normalize all falsy to null.
    queryFn: async () => (await api.get<ActiveTimer | null>('/dev-projects/active')).data || null,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const active = activeQuery.data;

  // Tick every second while running so the elapsed readout stays live.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Keep the card inside the viewport when the window resizes.
  useEffect(() => {
    const clamp = () =>
      setPos((p) => {
        if (!p) return p;
        const rect = cardRef.current?.getBoundingClientRect();
        const w = rect?.width ?? 260;
        const h = rect?.height ?? 120;
        return {
          x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
          y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
        };
      });
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  const stopTimer = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-active'] });
      qc.invalidateQueries({ queryKey: ['dev-projects'] });
    },
  });

  if (!active?.id || !active.startedAt) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = cardRef.current!.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const rect = cardRef.current!.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - rect.width),
      y: Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - rect.height),
    });
  };
  const onPointerUp = () => {
    if (dragRef.current && pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    dragRef.current = null;
  };

  const toggleMinimized = () =>
    setMinimized((m) => {
      localStorage.setItem(MIN_KEY, m ? '0' : '1');
      return !m;
    });

  const placement = pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 24 };
  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 900,
    ...placement,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    userSelect: 'none',
  };

  if (minimized) {
    return (
      <div
        ref={cardRef}
        style={{ ...baseStyle, padding: '0.4rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={toggleMinimized}
        title={`${active.name} — click to expand`}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block' }} />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatElapsed(active.startedAt)}</span>
      </div>
    );
  }

  return (
    <div ref={cardRef} style={{ ...baseStyle, width: 260, padding: '0.75rem 1rem' }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, touchAction: 'none' }}
      >
        <span style={{ color: 'var(--text-secondary, #888)', letterSpacing: 2 }}>⠿</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block' }} />
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{active.name}</strong>
        <button
          type="button"
          onClick={toggleMinimized}
          title="Minimize"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}
        >
          –
        </button>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '0.35rem 0 0.1rem' }}>
        {formatElapsed(active.startedAt)}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginBottom: '0.6rem' }}>
        {formatTotal(active.totalMinutes)}
      </div>
      <button
        type="button"
        className="btn btn-danger"
        style={{ width: '100%' }}
        disabled={stopTimer.isPending}
        onClick={() => stopTimer.mutate(active.id)}
      >
        {stopTimer.isPending ? 'Stopping…' : 'Stop'}
      </button>
      {stopTimer.isError && (
        <div className="error-text" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
          Failed to stop — try again.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `admin-web/src/layouts/AdminLayout.tsx`**

Add to the imports (near the other component imports at the top):

```tsx
import { RunningTimerWidget } from '../components/RunningTimerWidget';
```

Render it right after the closing `</main>` tag (line ~660), before the closing `</div>` of the content column:

```tsx
        </main>
        <RunningTimerWidget />
      </div>
```

- [ ] **Step 3: Sync DevProjectsPage's invalidation**

In `admin-web/src/pages/DevProjectsPage.tsx`, replace line 138:

```tsx
  const invalidate = () => qc.invalidateQueries({ queryKey: ['dev-projects'] });
```

with:

```tsx
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dev-projects'] });
    qc.invalidateQueries({ queryKey: ['dev-active'] });
  };
```

(All start/stop/progress mutations already call `invalidate`, so the widget updates instantly from page actions; the widget's own stop already invalidates `['dev-projects']` back.)

- [ ] **Step 4: Build the admin-web**

Run: `cd admin-web && npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/components/RunningTimerWidget.tsx admin-web/src/layouts/AdminLayout.tsx admin-web/src/pages/DevProjectsPage.tsx
git commit -m "feat: floating draggable dev task timer widget across all pages"
```

---

### Task 3: Manual smoke verification

**Files:** none (verification only — the project has no automated test suite).

- [ ] **Step 1: Start backend + admin-web**

Run backend (`npm run start:dev` or `node dist/main` after `npx nest build`) and admin-web (`npm run dev --prefix admin-web`), or the combined `npm run dev`.

- [ ] **Step 2: Developer flow**

Log in as a DEVELOPER user. On Dev Projects, start a task:
- Widget appears (bottom-right), ticking every second.
- Navigate to Dashboard/Earnings — widget persists and keeps ticking; page remains fully usable (no blocking).

- [ ] **Step 3: Drag / minimize / refresh**

- Drag by the ⠿ handle to another corner; refresh the page → position remembered, elapsed time still correct (derived from server `startedAt`).
- Minimize → pill with `● HH:MM:SS`; refresh → still minimized; click → expands.

- [ ] **Step 4: Auto-stop switch**

Start a DIFFERENT project while the first runs:
- No error; first project stops (its minutes accumulate into its total, session closed), second starts.
- Widget switches to the new project's name/timer.

- [ ] **Step 5: Stop from widget + admin check**

- Click Stop on the widget → widget disappears; Dev Projects list shows updated total and a closed session on the stopped project.
- Log in as SUPER_ADMIN → no widget appears anywhere; `GET /api/dev-projects/active` returns null (no 403 in console).

- [ ] **Step 6: Commit any fixups**

```bash
git add -A && git commit -m "fix: smoke-test fixups for floating dev timer"
```

(Skip if nothing changed.)

---

## Self-Review Notes

- **Spec coverage:** auto-stop-in-transaction (T1 S1), `GET /dev-projects/active` before `:id` with admin-null (T1 S2–S3), draggable/minimizable persistent widget with z-index 900 + localStorage keys (T2 S1), AdminLayout mount for cross-route persistence (T2 S2), shared query-key sync (T2 S1+S3), stop-error inline handling and silent-hide on query failure (`|| null` + `if (!active) return null`) (T2 S1), manual smoke incl. admin-no-widget (T3). All spec sections mapped.
- **Type consistency:** `findActive` select `{id, name, startedAt, totalMinutes}` matches the widget's `ActiveTimer` interface; query keys `['dev-active']`/`['dev-projects']` consistent across T1/T2.
- **Known nuance:** axios turns a null 200 body into `''`; handled by `|| null` in the queryFn.
