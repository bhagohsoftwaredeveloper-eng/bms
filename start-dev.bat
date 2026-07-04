@echo off
REM Start both dev servers (backend + admin-web) in separate windows
REM Double-click this file, or run "start-dev" from the project folder

echo Starting Beulah dev servers...

start "Backend (NestJS)" cmd /k "cd /d "%~dp0" && npm run start:dev"
start "Admin Web (Vite)" cmd /k "cd /d "%~dp0admin-web" && npm run dev"

echo Two windows opened: Backend + Admin Web. Close them to stop.
