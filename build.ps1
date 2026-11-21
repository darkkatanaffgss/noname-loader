$ErrorActionPreference = "Stop"

Write-Host "=== Aether Loader EXE Builder ===" -ForegroundColor Cyan

# Ensure MSVC linker environment if not already in PATH
if (-not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
    $vsPaths = @(
        "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
        "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
    )
    $vcvars = $vsPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($vcvars) {
        Write-Host "[+] Loading MSVC environment..." -ForegroundColor DarkGray
        cmd /c "`"$vcvars`" && set" | ForEach-Object {
            if ($_ -match "^([^=]+)=(.*)$") {
                [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
}

Write-Host "[+] Compiling release binary with Cargo..." -ForegroundColor Yellow
cargo build --release
if ($LASTEXITCODE -ne 0) {
    throw "Cargo build failed with exit code $LASTEXITCODE"
}

$releaseExe = Join-Path $PSScriptRoot "target\release\aether-loader.exe"
if (-not (Test-Path $releaseExe)) {
    throw "Build failed: $releaseExe not found."
}

$distDir = Join-Path $PSScriptRoot "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$outExe = Join-Path $distDir "NonameLoader.exe"
Copy-Item -Force $releaseExe $outExe

$sizeMb = [math]::Round((Get-Item $outExe).Length / 1MB, 2)
Write-Host "[OK] Built standalone EXE: $outExe ($sizeMb MB)" -ForegroundColor Green
