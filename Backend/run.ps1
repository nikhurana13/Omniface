<#
.SYNOPSIS
    OmniFace Execution Manager (PowerShell)

.DESCRIPTION
    Launcher and task runner for OmniFace FastAPI backend and Next.js frontend.

.PARAMETER Target
    The action to execute: 'both', 'backend', 'frontend', 'test', 'install', 'health', 'help'

.EXAMPLE
    .\run.ps1
    .\run.ps1 -Target both
    .\run.ps1 -Target backend
    .\run.ps1 -Target frontend
    .\run.ps1 -Target test
    .\run.ps1 -Target install
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [ValidateSet("both", "backend", "frontend", "test", "tests", "install", "health", "help")]
    [string]$Target
)

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "Omniface2.0\Frontend\omniface-__-multimodal-deepfake-forensics"

function Show-Header {
    Clear-Host
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "                     OMNIFACE EXECUTION MANAGER                      " -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-BackendServer {
    Write-Host "`n[*] Starting OmniFace Backend Server (FastAPI)..." -ForegroundColor Green
    Write-Host "    API URL:  http://127.0.0.1:8000" -ForegroundColor Cyan
    Write-Host "    API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Cyan
    Set-Location $BackendDir
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
}

function Start-FrontendServer {
    Write-Host "`n[*] Starting OmniFace Frontend Server (Next.js)..." -ForegroundColor Green
    Write-Host "    App URL:  http://localhost:3000" -ForegroundColor Cyan
    Set-Location $FrontendDir
    npm run dev
}

function Start-BothServers {
    Write-Host "`n[*] Launching Backend Server in a new window..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$BackendDir'; Write-Host 'OmniFace Backend Server' -ForegroundColor Cyan; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

    Write-Host "[*] Launching Frontend Server in a new window..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$FrontendDir'; Write-Host 'OmniFace Frontend Server' -ForegroundColor Cyan; npm run dev"

    Write-Host "`n[OK] Both services have been launched in separate terminal windows!" -ForegroundColor Yellow
    Write-Host "  - Backend API:    http://127.0.0.1:8000" -ForegroundColor Cyan
    Write-Host "  - Swagger Docs:   http://127.0.0.1:8000/docs" -ForegroundColor Cyan
    Write-Host "  - Frontend UI:    http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
}

function Run-PytestSuite {
    Write-Host "`n[*] Running Backend Pytest Suite..." -ForegroundColor Green
    Set-Location $RootDir
    python -m pytest backend/tests -v
}

function Install-AllDependencies {
    Write-Host "`n[*] Installing Backend Python Dependencies..." -ForegroundColor Green
    Set-Location $BackendDir
    python -m pip install -r requirements.txt

    Write-Host "`n[*] Installing Frontend Node.js Dependencies..." -ForegroundColor Green
    Set-Location $FrontendDir
    npm install

    Write-Host "`n[OK] Dependencies installation completed!" -ForegroundColor Yellow
}

function Check-HealthEndpoint {
    Write-Host "`n[*] Querying Backend Health Endpoint..." -ForegroundColor Green
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 5
        Write-Host "[OK] Backend is healthy:" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 4 | Write-Host -ForegroundColor Cyan
    } catch {
        Write-Host "[!] Could not connect to backend at http://127.0.0.1:8000/health." -ForegroundColor Red
        Write-Host "    Make sure the backend is running." -ForegroundColor Yellow
    }
}

if ($Target) {
    switch ($Target.ToLower()) {
        "both"      { Start-BothServers }
        "backend"   { Start-BackendServer }
        "frontend"  { Start-FrontendServer }
        "test"      { Run-PytestSuite }
        "tests"     { Run-PytestSuite }
        "install"   { Install-AllDependencies }
        "health"    { Check-HealthEndpoint }
        "help"      {
            Write-Host "Usage: .\run.ps1 [-Target] <both|backend|frontend|test|install|health>" -ForegroundColor Cyan
            exit 0
        }
    }
    exit 0
}

# Interactive Menu Loop
while ($true) {
    Show-Header
    Write-Host "  [1] Start Both (Backend + Frontend in separate windows)" -ForegroundColor White
    Write-Host "  [2] Start Backend Only (FastAPI - http://127.0.0.1:8000)" -ForegroundColor White
    Write-Host "  [3] Start Frontend Only (Next.js - http://localhost:3000)" -ForegroundColor White
    Write-Host "  [4] Run Backend Tests (pytest)" -ForegroundColor White
    Write-Host "  [5] Install Dependencies (pip requirements + npm packages)" -ForegroundColor White
    Write-Host "  [6] Check Backend Health Endpoint" -ForegroundColor White
    Write-Host "  [7] Exit" -ForegroundColor Red
    Write-Host ""
    Write-Host "=====================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Select an option [1-7]"

    switch ($choice) {
        "1" { Start-BothServers; pause }
        "2" { Start-BackendServer; pause }
        "3" { Start-FrontendServer; pause }
        "4" { Run-PytestSuite; pause }
        "5" { Install-AllDependencies; pause }
        "6" { Check-HealthEndpoint; pause }
        "7" { exit 0 }
        default { Write-Host "Invalid option. Press Enter to retry." -ForegroundColor Red; pause }
    }
}
