@echo off
title Noname Loader Client
cd /d "%~dp0"
if exist "dist\NonameLoader.exe" (
    start "" "dist\NonameLoader.exe"
) else (
    echo [*] Building Noname Loader release binary...
    powershell -ExecutionPolicy Bypass -File .\build.ps1
    if exist "dist\NonameLoader.exe" start "" "dist\NonameLoader.exe"
)
