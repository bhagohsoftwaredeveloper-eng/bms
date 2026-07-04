# Software Deployment & License Management Platform (SDLMP)

Centralized platform for managing software clients, license activations, field
installations, and payouts across POS, accounting, school, HR/payroll, and
inventory system deployments.

## Structure

- [backend/](backend/) — NestJS + Prisma + MySQL API (auth, clients,
  products, licenses, jobs, earnings, withdrawals, audit logs)
- [backend/admin-web/](backend/admin-web/) — React (Vite) Super Admin web
  portal, built and served by the API as static assets

## Backend setup

```
cd backend
npm install
```

1. Copy `.env` and point `DATABASE_URL` at your MySQL instance.
2. Run migrations: `npx prisma migrate dev`
3. Seed the first Super Admin account (reads `SEED_SUPER_ADMIN_EMAIL` /
   `SEED_SUPER_ADMIN_PASSWORD`, defaults to `admin@sdlmp.local` /
   `ChangeMe123!`):
   ```
   npm run db:seed
   ```
4. Start the API: `npm run start:dev` (listens on `http://localhost:3000/api`)

The license activation flow signs RSA-4096 JWTs; on first run the API
generates a key pair under `backend/keys/` (gitignored) — back this up for
production so previously activated licenses keep verifying after a restart.

## Admin web setup

```
cd backend/admin-web
npm install
cp .env.example .env   # set VITE_API_URL if the API isn't on localhost:3000
npm run dev
```

Sign in with the seeded Super Admin account. The portal currently covers:
clients, software products, license generation, installation job assignment,
incentive/earnings allocation, withdrawal approvals, team accounts, and audit
logs.

## Mobile app

- [mobile/](mobile/) — React Native (Expo Router) app for field staff
  (Installers, Designers, Machine Operators): login, assigned jobs,
  proof-of-installation upload (photo + GPS), earnings/withdrawals, and FCM
  push registration. See [mobile/README.md](mobile/README.md) for setup.

## Notifications & push

Per-user notifications are persisted (`notifications` table) and delivered live
over SSE; the backend also pushes through Firebase Cloud Messaging when
configured. To enable device push: run `npx prisma migrate dev` (creates the
`device_tokens` table) and set `FIREBASE_SERVICE_ACCOUNT_PATH` (or
`FIREBASE_SERVICE_ACCOUNT`) in `backend/.env`. Without credentials the API
keeps working and simply skips device push.
