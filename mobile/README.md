# Beulah Field — Mobile App (Expo)

React Native (Expo Router) companion app for **field staff** of the Software
Deployment & License Management Platform: Installers, Designers, and Machine
Operators. It talks to the same NestJS API as the admin web portal.

## What's included

- **Auth** — email/password login against `/api/auth/login`, JWT stored in
  `expo-secure-store`, automatic access-token refresh on 401 (`src/api.ts`,
  `src/auth.tsx`).
- **My Jobs** — list of jobs assigned to the signed-in installer
  (`GET /jobs?mine=true`), pull-to-refresh, status badges.
- **Job Detail** — start/complete a job (`PATCH /jobs/:id/status`) and submit
  **proof of installation**: capture a photo (camera), grab GPS coordinates,
  upload the image (`POST /uploads/images`), then `POST /jobs/:id/proof`.
- **Earnings** — available balance (`/withdrawals/balance`), earnings and
  withdrawal history.
- **Profile** — account info + sign out.
- **Push registration** — requests notification permission and registers the
  device token with `POST /notifications/device-token` (`src/push.ts`).

## Setup

```bash
cd mobile
npm install
npm start          # then press a (Android), i (iOS), or scan the QR in Expo Go
```

### Point the app at your API

The API base URL is read from `app.json` → `expo.extra.apiUrl`
(default `http://10.0.2.2:3000/api`, which is `localhost` as seen from the
Android emulator). Change it for your setup:

- **Android emulator:** `http://10.0.2.2:3000/api`
- **iOS simulator:** `http://localhost:3000/api`
- **Physical device:** `http://<your-computer-LAN-IP>:3000/api`

Make sure the backend (`cd backend && npm run start:dev`) is running and
reachable from the device/emulator.

## Push notifications (FCM)

The backend pushes through **Firebase Cloud Messaging**. To receive pushes on a
real build you must:

1. Add an Android app to your Firebase project, download `google-services.json`
   into `mobile/`, and add the iOS `GoogleService-Info.plist` for iOS.
2. Build a **dev/standalone build** (`npx expo prebuild` + EAS build) — Expo Go
   cannot resolve native FCM tokens.
3. Set the service-account credentials on the backend
   (`FIREBASE_SERVICE_ACCOUNT_PATH` in `backend/.env`) and run
   `npx prisma migrate dev` so the `device_tokens` table exists.

Until then the app runs fine; it simply won't deliver background pushes (the
in-app data still refreshes via the API).

## Project layout

```
app/
  _layout.tsx        Root stack + AuthProvider
  index.tsx          Auth gate → redirects to /login or /(tabs)
  login.tsx
  (tabs)/
    _layout.tsx      Tab bar (auth-guarded)
    index.tsx        My Jobs
    earnings.tsx
    profile.tsx
  job/[id].tsx       Job detail + proof submission
src/
  api.ts             Axios client + token refresh
  auth.tsx           Auth context (SecureStore)
  push.ts            FCM device-token registration
  types.ts
```
