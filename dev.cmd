@echo off
rem Starts the LoLDraftTool dev server (browser UI) without needing pnpm on PATH.
cd /d "%~dp0"
call npm.cmd --prefix app run dev
