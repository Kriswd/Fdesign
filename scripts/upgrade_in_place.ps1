param(
  [Parameter(Mandatory = $true)]
  [string]$NewZipPath,

  [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function EnsureDir([string]$p) {
  if (-not $p) { return }
  if (-not (Test-Path -LiteralPath $p -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $p -Force
  }
}

function CopyIfExists([string]$src, [string]$dst) {
  if (-not (Test-Path -LiteralPath $src)) { return $false }
  $parent = Split-Path -Parent $dst
  if ($parent) { EnsureDir $parent }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  return $true
}

function ReadManifestSafe([string]$manifestPath) {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return $null }
  try {
    return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

$install = (Resolve-Path -LiteralPath $InstallDir).Path
$zip = (Resolve-Path -LiteralPath $NewZipPath).Path

Write-Host "=== Fdesign In-place Upgrade (keep user data) ==="
Write-Host ("Install dir: " + $install)
Write-Host ("Upgrade zip: " + $zip)
Write-Host ("Mode:       " + ($(if ($DryRun.IsPresent) { 'dry-run' } else { 'apply' })))

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outputDir = Join-Path $install 'output'
$backupDir = Join-Path (Join-Path $outputDir 'upgrade_backups') $stamp

if (-not $DryRun.IsPresent) {
  EnsureDir $backupDir
  $copiedAny = $false
  $copiedAny = (CopyIfExists (Join-Path $outputDir 'db') (Join-Path $backupDir 'output\db')) -or $copiedAny
  $copiedAny = (CopyIfExists (Join-Path $outputDir 'templates') (Join-Path $backupDir 'output\templates')) -or $copiedAny
  $copiedAny = (CopyIfExists (Join-Path $outputDir 'admin') (Join-Path $backupDir 'output\admin')) -or $copiedAny
  if ($copiedAny) {
    Write-Host ("Backed up user data to: " + $backupDir)
  } else {
    Write-Host "No user data detected for backup (possible first install)."
  }
} else {
  Write-Host ("Will back up user data to: " + $backupDir)
}

$tmp = Join-Path $env:TEMP ("fdesign_upgrade_" + $stamp)
if (Test-Path -LiteralPath $tmp) {
  if (-not $DryRun.IsPresent) { Remove-Item -LiteralPath $tmp -Recurse -Force }
}
EnsureDir $tmp

try {
  Write-Host "Extracting upgrade zip to temp directory..."
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force

  $exclude = @('output', 'logs')
  $items = Get-ChildItem -LiteralPath $tmp

  if (-not $items) {
    throw ("Upgrade zip is empty after extraction: " + $tmp)
  }

  $incomingManifestPath = Join-Path $tmp 'RELEASE_MANIFEST.json'
  $installedManifestPath = Join-Path $install 'RELEASE_MANIFEST.json'
  $incomingManifest = ReadManifestSafe $incomingManifestPath
  $installedManifest = ReadManifestSafe $installedManifestPath
  $incomingMode = ''
  if ($incomingManifest -and $incomingManifest.packageMode) {
    $incomingMode = [string]$incomingManifest.packageMode
  }
  if (-not $incomingMode) { $incomingMode = 'full' }
  $incomingHash = ''
  if ($incomingManifest -and $incomingManifest.dependencyHash) {
    $incomingHash = [string]$incomingManifest.dependencyHash
  }
  $installedHash = ''
  if ($installedManifest -and $installedManifest.dependencyHash) {
    $installedHash = [string]$installedManifest.dependencyHash
  }

  if ($incomingMode -eq 'patch') {
    if (-not $installedManifest) {
      throw 'Current install is missing RELEASE_MANIFEST.json. Use full package (Fdesign_release_*.zip).'
    }
    if (-not $incomingHash -or -not $installedHash) {
      throw 'Patch or current install is missing dependencyHash. Use full package upgrade.'
    }
    if ($incomingHash -ne $installedHash) {
      throw 'Patch dependency hash mismatches current install. Use full package (Fdesign_release_*.zip).'
    }
    Write-Host 'Patch dependency check passed. Existing runtime and node_modules will be kept.'
  }

  $scriptsItem = $items | Where-Object { $_.Name -eq 'scripts' } | Select-Object -First 1
  $normalItems = $items | Where-Object { $_.Name -ne 'scripts' }

  foreach ($it in $normalItems) {
    if ($exclude -contains $it.Name) {
      Write-Host ("Skip preserved directory: " + $it.Name)
      continue
    }
    $dst = Join-Path $install $it.Name
    if ($DryRun.IsPresent) {
      Write-Host ("Will overwrite: " + $dst)
      continue
    }
    if (Test-Path -LiteralPath $dst) {
      Remove-Item -LiteralPath $dst -Recurse -Force
    }
    Copy-Item -LiteralPath $it.FullName -Destination $dst -Recurse -Force
    Write-Host ("Updated: " + $it.Name)
  }

  if ($scriptsItem) {
    if ($exclude -contains $scriptsItem.Name) {
      Write-Host ("Skip preserved directory: " + $scriptsItem.Name)
    } else {
      $dstScripts = Join-Path $install 'scripts'
      if ($DryRun.IsPresent) {
        Write-Host ("Will merge update: " + $dstScripts)
      } else {
        EnsureDir $dstScripts
        Copy-Item -LiteralPath (Join-Path $scriptsItem.FullName '*') -Destination $dstScripts -Recurse -Force
        Write-Host "Updated: scripts (merged to avoid self-delete while running)"
      }
    }
  }

  Write-Host ""
  Write-Host "Upgrade completed. User data directory is preserved: output\"
  Write-Host "If anything is wrong, roll back output\ from backup:"
  Write-Host ("  " + $backupDir)
  Write-Host ""
  Write-Host "Next: run start_app.bat."
} finally {
  if (-not $DryRun.IsPresent) {
    try {
      if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    } catch {
    }
  }
}
