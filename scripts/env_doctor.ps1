$ErrorActionPreference = 'Stop'

function HasCommand($name) {
  try {
    $null = Get-Command $name -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function PickFirstExistingFile($paths) {
  foreach ($p in $paths) {
    if (-not $p) { continue }
    try {
      if (Test-Path -LiteralPath $p) { return $p }
    } catch {
      continue
    }
  }
  return $null
}

function PickFirstExistingDir($paths) {
  foreach ($p in $paths) {
    if (-not $p) { continue }
    try {
      if (Test-Path -LiteralPath $p -PathType Container) { return $p }
    } catch {
      continue
    }
  }
  return $null
}

function TryWingetInstall($packageId, $displayName) {
  if (-not (HasCommand 'winget')) { return $false }
  Write-Host ("Installing: " + [string]$displayName)
  $args = @(
    'install',
    '--id', $packageId,
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements'
  )
  try {
    $p = Start-Process -FilePath 'winget' -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
    return ($p.ExitCode -eq 0)
  } catch {
    return $false
  }
}

function ResolveBrowserExe() {
  $fromEnv = [string]$env:PUPPETEER_EXECUTABLE_PATH
  if ($fromEnv.Trim().Length -gt 0) {
    if (Test-Path -LiteralPath $fromEnv) { return $fromEnv }
  }

  $bases = @()
  if ($env:PROGRAMFILES) { $bases += [string]$env:PROGRAMFILES }
  $pf86 = ${env:ProgramFiles(x86)}
  if ($pf86) { $bases += [string]$pf86 }
  if ($env:LOCALAPPDATA) { $bases += [string]$env:LOCALAPPDATA }

  $candidates = @()
  foreach ($b in $bases) {
    $candidates += (Join-Path $b 'Google\Chrome\Application\chrome.exe')
    $candidates += (Join-Path $b 'Microsoft\Edge\Application\msedge.exe')
    $candidates += (Join-Path $b 'Chromium\Application\chrome.exe')
  }

  return (PickFirstExistingFile $candidates)
}

function ResolvePhotoshopExe() {
  $found = @()
  $roots = @('HKLM:\SOFTWARE\Adobe\Photoshop', 'HKLM:\SOFTWARE\WOW6432Node\Adobe\Photoshop')
  foreach ($r in $roots) {
    try {
      if (-not (Test-Path $r)) { continue }
      $children = Get-ChildItem -Path $r -ErrorAction Stop
      foreach ($c in $children) {
        try {
          $p = Get-ItemProperty -Path $c.PSPath -ErrorAction Stop
          $install = [string]$p.InstallPath
          if ($install.Trim().Length -gt 0) {
            $exe = Join-Path $install 'Photoshop.exe'
            if (Test-Path -LiteralPath $exe) { $found += $exe }
          }
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  if ($found.Count -gt 0) { return $found[0] }
  return $null
}

function HasVCRuntimeX64() {
  $keys = @(
    'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64'
  )
  foreach ($k in $keys) {
    try {
      if (-not (Test-Path $k)) { continue }
      $p = Get-ItemProperty -Path $k -ErrorAction Stop
      $installed = [int]$p.Installed
      if ($installed -eq 1) { return $true }
    } catch {
      continue
    }
  }
  return $false
}

$root = Split-Path -Parent $PSScriptRoot
Write-Host 'Environment check started...'

function PrependPath($dir) {
  if (-not $dir) { return }
  try {
    $d = [string]$dir
    if (-not (Test-Path -LiteralPath $d -PathType Container)) { return }
    $current = [string]$env:PATH
    if ($current -and $current.ToLower().Contains($d.ToLower())) { return }
    $env:PATH = ($d + [string][System.IO.Path]::PathSeparator + $current)
  } catch {
    return
  }
}

$portableNodeDir = Join-Path $root 'runtime\node'
$portableNodeExe = Join-Path $portableNodeDir 'node.exe'
if (-not (Test-Path -LiteralPath $portableNodeExe -PathType Leaf)) {
  try {
    $picked = Get-ChildItem -LiteralPath $portableNodeDir -Recurse -File -Filter 'node.exe' -ErrorAction Stop | Select-Object -First 1
    if ($picked -and $picked.FullName) {
      $portableNodeExe = [string]$picked.FullName
    }
  } catch {
  }
}
if (Test-Path -LiteralPath $portableNodeExe -PathType Leaf) {
  PrependPath (Split-Path -Parent $portableNodeExe)
  Write-Host ('Bundled Node detected. Prioritizing: ' + [string]$portableNodeExe)
}

if (-not (HasCommand 'node')) {
  $installed = TryWingetInstall 'OpenJS.NodeJS.LTS' 'Node.js LTS'
  if (-not $installed) {
    Write-Host 'Node.js not found. Install Node.js LTS (Windows x64) and add it to PATH, or use a release package that contains runtime\\node.'
    exit 1
  }
}

if (-not (HasCommand 'node')) {
  Write-Host 'Node.js is still unavailable.'
  exit 1
}

if (-not (HasCommand 'npm')) {
  Write-Host 'npm not found. Reinstall Node.js (the official installer includes npm).'
  exit 1
}

if (-not (HasVCRuntimeX64)) {
  $bundledVc = Join-Path $root 'runtime\vcredist\vc_redist.x64.exe'
  if (Test-Path -LiteralPath $bundledVc -PathType Leaf) {
    Write-Host ('VC++ Runtime not found. Trying bundled installer: ' + [string]$bundledVc)
    try {
      $p = Start-Process -FilePath $bundledVc -ArgumentList @('/install','/passive','/norestart') -Wait -PassThru
      if ($p.ExitCode -ne 0) {
        Write-Host ('Bundled VC++ installer failed. Exit code: ' + [string]$p.ExitCode)
      }
    } catch {
      Write-Host ('Failed to start bundled VC++ installer: ' + [string]$_.Exception.Message)
    }
  }
  if (-not (HasVCRuntimeX64)) {
    $null = TryWingetInstall 'Microsoft.VCRedist.2015+.x64' 'VC++ 2015-2022 Runtime (x64)'
  }
}

$browser = ResolveBrowserExe
if (-not $browser) {
  $null = TryWingetInstall 'Google.Chrome' 'Google Chrome'
}

$ps = ResolvePhotoshopExe
if (-not $ps) {
  Write-Host 'Warning: Photoshop not found. PSD export/write-back may be unavailable.'
}

Write-Host 'Environment check completed.'
exit 0
