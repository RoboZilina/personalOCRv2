# Quick Audit PowerShell Script for personalOCR
# Run: .\scripts\quick_audit.ps1

$ErrorActionPreference = 'SilentlyContinue'
$baseDir = Split-Path $PSScriptRoot -Parent

Write-Host "`n🔍 Running Quick Audit...`n" -ForegroundColor Cyan
Write-Host ("━" * 60) -ForegroundColor Gray
Write-Host "1️⃣  initEventListeners Definitions" -ForegroundColor White
Write-Host ("━" * 60) -ForegroundColor Gray

$initListeners = Select-String -Path "$baseDir\app.js" -Pattern 'function\s+initEventListeners\b'
Write-Host "   Count: $($initListeners.Count) (expected: 1)" -ForegroundColor $(if($initListeners.Count -eq 1){'Green'}else{'Red'})
$initListeners | ForEach-Object { Write-Host "   📍 app.js:$($_.LineNumber)" -ForegroundColor Gray }

Write-Host "`n$("━" * 60)" -ForegroundColor Gray
Write-Host "2️⃣  isProcessing Assignments" -ForegroundColor White
Write-Host ("━" * 60) -ForegroundColor Gray

$isProc = Select-String -Path "$baseDir\app.js" -Pattern '\bisProcessing\s*=' -AllMatches
Write-Host "   Count: $($isProc.Count) occurrences" -ForegroundColor Yellow
$isProc | Select-Object -First 5 | ForEach-Object { 
    $line = $_.Line.Trim()
    if ($line.Length -gt 60) { $line = $line.Substring(0, 60) + "..." }
    Write-Host "   📍 app.js:$($_.LineNumber): $line" -ForegroundColor Gray 
}

Write-Host "`n$("━" * 60)" -ForegroundColor Gray
Write-Host "3️⃣  DOM Insertion Points (.innerHTML)" -ForegroundColor White
Write-Host ("━" * 60) -ForegroundColor Gray

$innerHTML = Select-String -Path "$baseDir\*.js" -Pattern '\.innerHTML\b' -AllMatches
Write-Host "   Count: $($innerHTML.Count) occurrence(s)" -ForegroundColor Yellow
$innerHTML | ForEach-Object {
    $line = $_.Line.Trim()
    $safe = $line -match "innerHTML\s*=\s*['\"``]\s*['\"``]"  # empty string assignment
    $marker = if ($safe) { '✅' } else { '⚠️ REVIEW' }
    if ($line.Length -gt 55) { $line = $line.Substring(0, 55) + "..." }
    $file = Split-Path $_.Path -Leaf
    Write-Host "      $marker $file`:$($_.LineNumber): $line" -ForegroundColor $(if($safe){'Gray'}else{'Red'})
}

Write-Host "`n$("━" * 60)" -ForegroundColor Gray
Write-Host "✅ Audit Complete" -ForegroundColor Green
Write-Host ("━" * 60) -ForegroundColor Gray
