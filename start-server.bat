@echo off
title Noname Loader API Server & Web Admin
cd /d "%~dp0"
echo ========================================================
echo   Starting Noname Loader License Server & Web Admin
echo ========================================================
if not exist "api-server\.env" (
    echo [*] Generating fresh cryptographic keys...
    node scripts/setup-keys.js
)
echo [*] Launching Node.js SQLite server on port 3840...
echo [*] Web Admin URL: http://127.0.0.1:3840/admin
echo.
node api-server/server.js
pause
