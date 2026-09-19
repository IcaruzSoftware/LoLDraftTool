@echo off
rem Builds the frontend, then builds and launches the desktop window (WPF + WebView2).
cd /d "%~dp0"
call npm.cmd --prefix app run build || exit /b 1
dotnet build host -c Debug --nologo -v q || exit /b 1
start "" "host\bin\Debug\net10.0-windows\LoLDraftTool.exe"
