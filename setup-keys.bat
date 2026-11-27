@echo off
title Noname Loader — Cryptographic Key Generator
cd /d "%~dp0"
node scripts/setup-keys.js %*
pause
