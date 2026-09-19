@echo off
rem Starts the LoLDraftTool dev server in its own console window and opens the browser.
rem No pnpm needed; there is no backend, the Vite server is everything.
cd /d "%~dp0"
start "LoLDraftTool dev server" cmd /k npm.cmd --prefix app run dev
timeout /t 4 /nobreak >nul
start "" http://localhost:5173/
