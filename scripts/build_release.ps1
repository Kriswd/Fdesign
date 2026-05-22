param(
  [string]$Suffix = 'fix3',
  [switch]$SkipBuild,
  [switch]$IncludePortableNode,
  [switch]$IncludeVCRedist,
  [string[]]$IncludeTemplateIds,
  [string]$NodeVersion,
  [ValidateSet('full', 'patch', 'both')]
  [string]$PackageMode = 'patch'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'output\release'

if (-not (Test-Path -LiteralPath $outDir -PathType Container)) {
  $null = New-Item -ItemType Directory -Path $outDir -Force
}

if (-not $SkipBuild) {
  Write-Host 'Building frontend dist...'
  $p = Start-Process -FilePath 'npm' -ArgumentList @('run', 'build') -WorkingDirectory $root -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "npm run build failed, exit code: $($p.ExitCode)" }
}

$distIndex = Join-Path $root 'dist\index.html'
if (-not (Test-Path -LiteralPath $distIndex -PathType Leaf)) {
  throw ("Missing dist artifact: " + $distIndex + ". Please run `npm run build` then retry packaging.")
}

$nodeModulesDir = Join-Path $root 'node_modules'
if (-not (Test-Path -LiteralPath $nodeModulesDir -PathType Container)) {
  throw ("Missing node_modules: " + $nodeModulesDir + ". Please run `npm install` then retry packaging.")
}

$withNode = $IncludePortableNode.IsPresent -or (-not $PSBoundParameters.ContainsKey('IncludePortableNode'))
$withVCRedist = $IncludeVCRedist.IsPresent -or (-not $PSBoundParameters.ContainsKey('IncludeVCRedist'))
$emitFull = $PackageMode -eq 'full' -or $PackageMode -eq 'both'
$emitPatch = $PackageMode -eq 'patch' -or $PackageMode -eq 'both'

$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$stageDir = Join-Path $outDir ("_stage_" + $stamp + "_" + $Suffix)
$zipPath = Join-Path $outDir ("Fdesign_release_" + $stamp + "_" + $Suffix + ".zip")
$patchStageDir = Join-Path $outDir ("_stage_patch_" + $stamp + "_" + $Suffix)
$patchZipPath = Join-Path $outDir ("Fdesign_patch_" + $stamp + "_" + $Suffix + ".zip")

if (Test-Path -LiteralPath $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}
$null = New-Item -ItemType Directory -Path $stageDir -Force
if (Test-Path -LiteralPath $patchStageDir) {
  Remove-Item -LiteralPath $patchStageDir -Recurse -Force
}

function CopyItemSafe($srcPath, $dstPath) {
  if (-not (Test-Path -LiteralPath $srcPath)) { return }
  $dstParent = Split-Path -Parent $dstPath
  if ($dstParent -and (-not (Test-Path -LiteralPath $dstParent))) {
    $null = New-Item -ItemType Directory -Path $dstParent -Force
  }
  Copy-Item -LiteralPath $srcPath -Destination $dstPath -Recurse -Force -ErrorAction Stop
}

function EnsureDir($p) {
  if (-not (Test-Path -LiteralPath $p -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $p -Force
  }
}

function DownloadFile($url, $destPath) {
  $parent = Split-Path -Parent $destPath
  if ($parent) { EnsureDir $parent }
  Write-Host ("Downloading: " + $url)
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destPath
  if (-not (Test-Path -LiteralPath $destPath -PathType Leaf)) {
    throw ("Download failed: " + $url)
  }
}

function PickLatestNodeZipUrl() {
  if ($NodeVersion) {
    $v = [string]$NodeVersion
    if (-not $v.StartsWith('v')) { $v = 'v' + $v }
    return ("https://nodejs.org/dist/" + $v + "/node-" + $v + "-win-x64.zip")
  }
  $indexUrl = 'https://nodejs.org/dist/index.json'
  Write-Host ("Fetching Node version index: " + $indexUrl)
  $jsonText = (Invoke-WebRequest -UseBasicParsing -Uri $indexUrl).Content
  $list = $jsonText | ConvertFrom-Json
  foreach ($it in $list) {
    if (-not $it) { continue }
    $lts = $it.lts
    if ($lts -eq $false) { continue }
    $v = [string]$it.version
    if (-not $v) { continue }
    return ("https://nodejs.org/dist/" + $v + "/node-" + $v + "-win-x64.zip")
  }
  throw 'Failed to resolve a Node.js LTS version from nodejs.org'
}

function EnsurePortableNode($dstDir, $cacheDir) {
  $nodeExe = Join-Path $dstDir 'node.exe'
  if (Test-Path -LiteralPath $nodeExe -PathType Leaf) {
    Write-Host ("Portable Node already exists: " + $nodeExe)
    return
  }

  if (Test-Path -LiteralPath $dstDir) {
    Remove-Item -LiteralPath $dstDir -Recurse -Force
  }
  EnsureDir $dstDir
  EnsureDir $cacheDir
  $zipUrl = PickLatestNodeZipUrl
  $zipName = Split-Path -Leaf $zipUrl
  $zipPath = Join-Path $cacheDir $zipName
  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    DownloadFile $zipUrl $zipPath
  } else {
    Write-Host ("Using cache: " + $zipPath)
  }

  $tmpExtract = Join-Path $cacheDir ('node_extract_' + $stamp)
  if (Test-Path -LiteralPath $tmpExtract) {
    Remove-Item -LiteralPath $tmpExtract -Recurse -Force
  }
  EnsureDir $tmpExtract
  Expand-Archive -LiteralPath $zipPath -DestinationPath $tmpExtract -Force

  $child = Get-ChildItem -LiteralPath $tmpExtract -Directory | Select-Object -First 1
  if (-not $child) { throw 'Node extract failed: no directory found' }
  $srcDir = $child.FullName
  $srcExe = Join-Path $srcDir 'node.exe'
  if (-not (Test-Path -LiteralPath $srcExe -PathType Leaf)) { throw 'Node extract failed: node.exe not found' }

  Copy-Item -Path (Join-Path $srcDir '*') -Destination $dstDir -Recurse -Force
  if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw 'Portable Node copy failed' }
  Write-Host ("Bundled portable Node: " + $nodeExe)
}

function EnsureVCRedistInstaller($dstExePath, $cacheDir) {
  if (Test-Path -LiteralPath $dstExePath -PathType Leaf) {
    Write-Host ("VC++ installer already exists: " + $dstExePath)
    return
  }
  EnsureDir $cacheDir
  $url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'
  $cacheExe = Join-Path $cacheDir 'vc_redist.x64.exe'
  if (-not (Test-Path -LiteralPath $cacheExe -PathType Leaf)) {
    DownloadFile $url $cacheExe
  } else {
    Write-Host ("Using cache: " + $cacheExe)
  }
  CopyItemSafe $cacheExe $dstExePath
  if (-not (Test-Path -LiteralPath $dstExePath -PathType Leaf)) { throw 'VC++ installer copy failed' }
  Write-Host ("Bundled VC++ installer: " + $dstExePath)
}

CopyItemSafe (Join-Path $root 'dist') (Join-Path $stageDir 'dist')
CopyItemSafe (Join-Path $root 'server') (Join-Path $stageDir 'server')
CopyItemSafe (Join-Path $root 'package.json') (Join-Path $stageDir 'package.json')
CopyItemSafe (Join-Path $root 'start_release.bat') (Join-Path $stageDir 'start_app.bat')
CopyItemSafe (Join-Path $root 'start_new_project.py') (Join-Path $stageDir 'start_new_project.py')

$scriptsStageDir = Join-Path $stageDir 'scripts'
EnsureDir $scriptsStageDir
CopyItemSafe (Join-Path $root 'scripts\upgrade_in_place.ps1') (Join-Path $scriptsStageDir 'upgrade_in_place.ps1')
CopyItemSafe (Join-Path $root 'scripts\env_doctor.ps1') (Join-Path $scriptsStageDir 'env_doctor.ps1')

$serverStageDir = Join-Path $stageDir 'server'
if (Test-Path -LiteralPath $serverStageDir -PathType Container) {
  $prunePatterns = @(
    '_backup_*',
    'test_*.js',
    'test_*.mjs',
    'verify_*.js',
    'verify_*.mjs'
  )
  foreach ($pt in $prunePatterns) {
    Get-ChildItem -LiteralPath $serverStageDir -Filter $pt -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSIsContainer) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      } else {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    }
  }
  $serverScriptsDir = Join-Path $serverStageDir 'scripts'
  if (Test-Path -LiteralPath $serverScriptsDir -PathType Container) {
    Remove-Item -LiteralPath $serverScriptsDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath (Join-Path $serverStageDir 'services') -Filter '*.test.*' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath (Join-Path $serverStageDir 'utils') -Filter '*.test.*' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
}

try {
  $fontsSrc = Get-ChildItem -LiteralPath $root -Directory -ErrorAction Stop | Where-Object { $_.Name -like '3-*' } | Select-Object -First 1
  if ($fontsSrc -and (Test-Path -LiteralPath $fontsSrc.FullName -PathType Container)) {
    CopyItemSafe $fontsSrc.FullName (Join-Path (Join-Path $stageDir 'dist') $fontsSrc.Name)
  }
} catch {
}

# 不再在发布包中创建空 output/ 目录,避免用户直接解压覆盖时导致已有数据丢失
# output/templates/{id}/ 仅在 -IncludeTemplateIds 指定时按需创建
# output/db/ 等数据目录由服务端启动时自动创建
# $null = New-Item -ItemType Directory -Path (Join-Path $stageDir 'output') -Force

function IsSafeTemplateId($id) {
  if (-not $id) { return $false }
  $s = [string]$id
  return $s -match '^[0-9a-f]{16}$'
}

function CopyTemplateMinimal($templateId, $dstTemplatesDir) {
  if (-not (IsSafeTemplateId $templateId)) {
    throw ("Invalid templateId: " + [string]$templateId)
  }
  $srcDir = Join-Path (Join-Path $root 'output\templates') $templateId
  if (-not (Test-Path -LiteralPath $srcDir -PathType Container)) {
    throw ("Template not found on disk: " + $srcDir)
  }
  EnsureDir $dstTemplatesDir
  $dstDir = Join-Path $dstTemplatesDir $templateId
  EnsureDir $dstDir

  $essentialFiles = @('manifest.json', 'source.psd', 'reference.png', 'backdrop.png', 'slot-config.json', 'job_reference.json', 'result_reference.json')
  foreach ($name in $essentialFiles) {
    $src = Join-Path $srcDir $name
    if (Test-Path -LiteralPath $src -PathType Leaf) {
      CopyItemSafe $src (Join-Path $dstDir $name)
    }
  }

  $imagesDir = Join-Path $srcDir 'images'
  if ((-not (Test-Path -LiteralPath (Join-Path $dstDir 'reference.png') -PathType Leaf)) -and (Test-Path -LiteralPath $imagesDir -PathType Container)) {
    CopyItemSafe $imagesDir (Join-Path $dstDir 'images')
  }
}

if ($IncludeTemplateIds -and $IncludeTemplateIds.Count -gt 0) {
  $dstTemplatesDir = Join-Path (Join-Path $stageDir 'output') 'templates'
  foreach ($tid in $IncludeTemplateIds) {
    $tidClean = ([string]$tid).Trim()
    CopyTemplateMinimal $tidClean $dstTemplatesDir
    $probe = Join-Path (Join-Path $dstTemplatesDir $tidClean) 'manifest.json'
    if (-not (Test-Path -LiteralPath $probe -PathType Leaf)) {
      throw ("Template include failed: missing manifest in stage: " + $probe)
    }
    Write-Host ("Included template in release output/templates: " + $tidClean)
  }
}

$cacheDir = Join-Path $outDir '_cache'
if ($emitFull) {
  CopyItemSafe (Join-Path $root 'node_modules') (Join-Path $stageDir 'node_modules')
}
if ($emitFull -and $withNode) {
  if (-not $NodeVersion) {
    try {
      $nv = (node -v) | Out-String
      $nv = ($nv -replace '\s+', '').Trim()
      if ($nv -and $nv.StartsWith('v')) {
        $NodeVersion = $nv
        Write-Host ("Using local Node version for portable runtime: " + $NodeVersion)
      }
    } catch {
    }
  }
  $nodeDstDir = Join-Path $stageDir 'runtime\node'
  EnsurePortableNode $nodeDstDir $cacheDir
}
if ($emitFull -and $withVCRedist) {
  $vcDstExe = Join-Path $stageDir 'runtime\vcredist\vc_redist.x64.exe'
  EnsureVCRedistInstaller $vcDstExe $cacheDir
}

function ResolveDependencyHash() {
  $lock = Join-Path $root 'package-lock.json'
  $pkg = Join-Path $root 'package.json'
  if (Test-Path -LiteralPath $lock -PathType Leaf) {
    return (Get-FileHash -LiteralPath $lock -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  if (Test-Path -LiteralPath $pkg -PathType Leaf) {
    return (Get-FileHash -LiteralPath $pkg -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  return ''
}
$dependencyHash = ResolveDependencyHash

$manifest = @{
  package = 'psd-to-ecommerce-new'
  version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
  stamp = $stamp
  suffix = $Suffix
  builtAt = (Get-Date).ToString('s')
  packageMode = 'full'
  dependencyHash = $dependencyHash
  nodeRuntimeBundled = ($emitFull -and $withNode)
  nodeVersion = $NodeVersion
} | ConvertTo-Json -Depth 6
Set-Content -LiteralPath (Join-Path $stageDir 'RELEASE_MANIFEST.json') -Value $manifest -Encoding UTF8

function CreateZipFromStage($fromStageDir, $dstZipPath) {
  if (Test-Path -LiteralPath $dstZipPath) {
    Remove-Item -LiteralPath $dstZipPath -Force
  }
  try {
    $tar = Get-Command tar -ErrorAction Stop
    $p = Start-Process -FilePath $tar.Source -ArgumentList @('-a', '-c', '-f', $dstZipPath, '-C', $fromStageDir, '.') -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { throw ("tar failed, exit code: " + $p.ExitCode) }
  } catch {
    Compress-Archive -Path (Join-Path $fromStageDir '*') -DestinationPath $dstZipPath -Force
  }
}

if ($emitFull) {
  Write-Host 'Creating full release zip...'
  CreateZipFromStage $stageDir $zipPath
  Write-Host ("Full release zip created: " + $zipPath)
}

if ($emitPatch) {
  $null = New-Item -ItemType Directory -Path $patchStageDir -Force
  CopyItemSafe (Join-Path $stageDir 'dist') (Join-Path $patchStageDir 'dist')
  CopyItemSafe (Join-Path $stageDir 'server') (Join-Path $patchStageDir 'server')
  CopyItemSafe (Join-Path $stageDir 'scripts') (Join-Path $patchStageDir 'scripts')
  CopyItemSafe (Join-Path $stageDir 'package.json') (Join-Path $patchStageDir 'package.json')
  CopyItemSafe (Join-Path $stageDir 'start_app.bat') (Join-Path $patchStageDir 'start_app.bat')
  CopyItemSafe (Join-Path $stageDir 'start_new_project.py') (Join-Path $patchStageDir 'start_new_project.py')
  if (Test-Path -LiteralPath (Join-Path $stageDir 'output\templates') -PathType Container) {
    CopyItemSafe (Join-Path $stageDir 'output\templates') (Join-Path $patchStageDir 'output\templates')
  }
  $patchManifest = @{
    package = 'psd-to-ecommerce-new'
    version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    stamp = $stamp
    suffix = $Suffix
    builtAt = (Get-Date).ToString('s')
    packageMode = 'patch'
    dependencyHash = $dependencyHash
    nodeRuntimeBundled = $false
    nodeVersion = $NodeVersion
  } | ConvertTo-Json -Depth 6
  Set-Content -LiteralPath (Join-Path $patchStageDir 'RELEASE_MANIFEST.json') -Value $patchManifest -Encoding UTF8

  Write-Host 'Creating patch zip...'
  CreateZipFromStage $patchStageDir $patchZipPath
  Write-Host ("Patch zip created: " + $patchZipPath)
}

Write-Host 'Cleaning old release artifacts...'
if ($emitFull) {
  Get-ChildItem -LiteralPath $outDir -File -Filter 'Fdesign_release_*.zip' |
    Where-Object { $_.FullName -ne $zipPath } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
}
if ($emitPatch) {
  Get-ChildItem -LiteralPath $outDir -File -Filter 'Fdesign_patch_*.zip' |
    Where-Object { $_.FullName -ne $patchZipPath } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
}

Get-ChildItem -LiteralPath $outDir -Directory |
  Where-Object { $_.Name -like '_stage_*' -or $_.Name -like '_stage_patch_*' -or $_.Name -like 'test_deploy_*' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
