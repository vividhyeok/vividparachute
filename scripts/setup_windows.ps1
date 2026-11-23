$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "[1/4] Checking Python ..." -ForegroundColor Cyan
py --version
if (-not (Test-Path '.venv\Scripts\python.exe')) { py -m venv .venv }
$Python = '.venv\Scripts\python.exe'
Write-Host "[2/4] Installing PDF library ..." -ForegroundColor Cyan
& $Python -m pip install -r requirements.txt
Write-Host "[3/4] Trying verified direct download links ..." -ForegroundColor Cyan
& $Python scripts\download_verified.py
Write-Host "[4/4] Generating draft question crops/index ..." -ForegroundColor Cyan
& $Python scripts\ingest_pdfs.py
Write-Host "Done. Open data\processed\index.html and check every question against its PDF." -ForegroundColor Green
