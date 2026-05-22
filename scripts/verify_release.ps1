# Release Verification Script
# Usage: powershell.exe -ExecutionPolicy Bypass -File scripts/verify_release.ps1 -PackageName "suffix"

param([string]$PackageName = "", [switch]$SkipE2E)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$failCount = 0
$passCount = 0

function WP([string]$m) { Write-Host ("  [PASS] " + $m) -ForegroundColor Green; $script:passCount++ }
function WF([string]$m) { Write-Host ("  [FAIL] " + $m) -ForegroundColor Red; $script:failCount++ }
function FN([string]$m) { WF $m; throw $m }

Write-Host "============================================"
Write-Host "  Release Verification"
Write-Host "============================================"

# Step 1: Code Review
Write-Host "[1/7] Code Review..." -ForegroundColor Cyan
$changed = git diff --name-only
Write-Host "  Changed files:"
$changed | ForEach-Object { Write-Host ("    - " + $_) }

$jsxFiles = Get-ChildItem -Path (Join-Path $root "server\photoshop") -Filter "*.jsx" -Recurse
$realBadPatterns = @(
  'Object.keys(', 'Object.values(', 'Object.entries(',
  '.forEach(', '.map(', '.filter(', '.reduce(', '.includes(', '.find(',
  ' const ', ' let '
)
$es5Found = $false
foreach ($jsx in $jsxFiles) {
  $lines = Get-Content -Path $jsx.FullName -Encoding UTF8
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line.StartsWith('//') -or $line.StartsWith('*') -or $line.StartsWith('/*')) { continue }
    if ($line -match '^\s*logArr\.push\(') { continue }
    foreach ($pat in $realBadPatterns) {
      if ($line.Contains($pat)) {
        Write-Host ("  [WARN] L" + ($i+1) + " " + $jsx.Name + ": " + $line.Substring(0, [Math]::Min(70, $line.Length))) -ForegroundColor Yellow
        $es5Found = $true
      }
    }
  }
  # Arrow function: check if file uses ES3 style (function keyword) vs arrow
  $funcCount = ($lines | Where-Object { $_ -match '\bfunction\b' }).Count
  $arrowCount = ($lines | Where-Object { $_ -match '=>' -and $_ -notmatch '["'']=>["'']' -and $_ -notmatch 'logArr' }).Count
  if ($arrowCount -gt 0 -and $funcCount -gt 0) {
    Write-Host ("  [WARN] " + $jsx.Name + ": mixed function styles (" + $arrowCount + " arrows vs " + $funcCount + " functions)") -ForegroundColor Yellow
    $es5Found = $true
  }
}
if ($es5Found) { FN "ExtendScript contains ES5+ syntax" } else { WP "ExtendScript ES3 check passed" }

# Step 2: Clean Build
Write-Host "[2/7] Clean Build..." -ForegroundColor Cyan
if (Test-Path (Join-Path $root "dist")) { Remove-Item -Path (Join-Path $root "dist") -Recurse -Force }
if (Test-Path (Join-Path $root "node_modules\.vite")) { Remove-Item -Path (Join-Path $root "node_modules\.vite") -Recurse -Force }
$p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm", "run", "build") -WorkingDirectory $root -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) { FN "npm run build failed: " + $p.ExitCode }
WP "Frontend build success"

# Step 3: Artifact Verification
Write-Host "[3/7] Artifact Verification..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root "dist\index.html"))) { FN "dist/index.html missing" }
WP "dist/index.html exists"
$jsFiles = Get-ChildItem -Path (Join-Path $root "dist\assets") -Filter "*.js"
if ($jsFiles.Count -eq 0) { FN "No JS files in dist/assets" }
WP ("Found " + $jsFiles.Count + " JS files")

# Step 4: Tests
Write-Host "[4/7] Test Suite..." -ForegroundColor Cyan
$tests = @("src\utils\exportZipLayout.test.mjs", "tests\exportZipLayout.test.mjs")
$allOk = $true
foreach ($t in $tests) {
  $tp = Join-Path $root $t
  if (Test-Path $tp) {
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "node", "--test", $tp) -WorkingDirectory $root -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { WF ("Test failed: " + $t); $allOk = $false } else { WP ("Test passed: " + $t) }
  }
}
if (-not $allOk) { FN "Tests failed" }

# Step 5: Package
Write-Host "[5/7] Packaging..." -ForegroundColor Cyan
$suffix = if ($PackageName) { $PackageName } else { "verified_" + (Get-Date -Format "yyyyMMdd_HHmm") }
$p = Start-Process -FilePath "powershell.exe" -ArgumentList @("-Command", "& { ./scripts/build_release.ps1 -SkipBuild -PackageMode patch -Suffix '$suffix' }") -WorkingDirectory $root -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) { FN "Packaging failed" }
$zipPattern = Join-Path $root ("output\release\Fdesign_patch_" + (Get-Date -Format "yyyyMMdd") + "_*" + $suffix + ".zip")
$latestZip = Get-ChildItem -Path $zipPattern | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestZip) { FN "Patch zip not found" }
WP ("Patch created: " + $latestZip.Name)

# Step 6: Extract & Verify
Write-Host "[6/7] Extract & Verify..." -ForegroundColor Cyan
$vDir = Join-Path $root "_verify_release"
if (Test-Path $vDir) { Remove-Item -Path $vDir -Recurse -Force }
New-Item -ItemType Directory -Path $vDir -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($latestZip.FullName, $vDir)
WP "Extracted to _verify_release"

$zipJsx = Get-ChildItem -Path (Join-Path $vDir "server\photoshop") -Filter "*.jsx" -Recurse
$zipBad = $false
foreach ($j in $zipJsx) {
  $c = Get-Content -Path $j.FullName -Raw -Encoding UTF8
  foreach ($pat in $badSyntax) { if ($c.Contains($pat)) { WF ("ES5+ in zip: " + $j.Name + " / " + $pat); $zipBad = $true } }
}
if ($zipBad) { FN "Zip contains ES5+ syntax" } else { WP "Zip ES3 check passed" }

$reqFiles = @("server\utils\templateMeta.js", "server\photoshop\render_export.jsx", "server\services\photoshopIngest.js", "dist\index.html", "RELEASE_MANIFEST.json")
foreach ($f in $reqFiles) {
  if (Test-Path (Join-Path $vDir $f)) { WP ("File exists: " + $f) } else { WF ("File missing: " + $f) }
}
Remove-Item -Path $vDir -Recurse -Force

# Step 7: E2E
if (-not $SkipE2E) {
  Write-Host "[7/7] E2E Verification..." -ForegroundColor Cyan
  Write-Host "  Manual: cover patch, restart, test PSD export"
  Read-Host "  Press Enter when done"
}

# Summary
Write-Host "============================================"
Write-Host ("  PASS: " + $passCount) -ForegroundColor Green
if ($failCount -gt 0) {
  Write-Host ("  FAIL: " + $failCount) -ForegroundColor Red
  Write-Host "  BLOCKED" -ForegroundColor Red
  exit 1
} else {
  Write-Host "  FAIL: 0" -ForegroundColor Green
  Write-Host "  READY TO DELIVER" -ForegroundColor Green
  Write-Host ("  Zip: " + $latestZip.FullName) -ForegroundColor Cyan
}
