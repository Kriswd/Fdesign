param(
    [string]$ZipPath,
    [int]$Port = 3005
)

$ErrorActionPreference = 'Stop'
$testDir = Join-Path (Split-Path $ZipPath -Parent) "test_deploy_$Port"

if (Test-Path $testDir) {
    Remove-Item $testDir -Recurse -Force
}
New-Item -ItemType Directory -Path $testDir | Out-Null

Write-Host "Unzipping $ZipPath to $testDir..."
Expand-Archive -Path $ZipPath -DestinationPath $testDir -Force

# The zip might have a top-level folder or not. Let's find package.json
$pkg = Get-ChildItem -Path $testDir -Filter "package.json" -Recurse | Select-Object -First 1
if (-not $pkg) {
    throw "package.json not found in the zip!"
}
$appRoot = $pkg.Directory.FullName
Write-Host "App root found at: $appRoot"

$nodeExe = Join-Path $appRoot "runtime\node\node.exe"
$serverScript = "server\index.js"

if (-not (Test-Path $nodeExe)) {
    Write-Warning "Portable node not found at $nodeExe, using system node"
    $nodeExe = "node"
}

Write-Host "Starting server on port $Port..."
$env:PORT = $Port
$env:NODE_ENV = "production"

# Start process with correct working directory
$process = Start-Process -FilePath $nodeExe -ArgumentList $serverScript -WorkingDirectory $appRoot -PassThru -NoNewWindow

# Wait for server to start
$maxRetries = 20
$retryCount = 0
$serverReady = $false

while ($retryCount -lt $maxRetries) {
    Start-Sleep -Seconds 2
    try {
        $healthUrl = "http://127.0.0.1:$Port/health"
        $response = Invoke-RestMethod -Uri $healthUrl -Method Get -ErrorAction SilentlyContinue
        if ($response -and $response.status -eq 'ok') {
            $serverReady = $true
            break
        }
    } catch {}
    $retryCount++
    Write-Host "." -NoNewline
}
Write-Host ""

try {
    if (-not $serverReady) {
        throw "Server failed to start within timeout"
    }
    
    Write-Host "✅ Health check passed!" -ForegroundColor Green

    $indexUrl = "http://127.0.0.1:$Port/"
    Write-Host "Checking frontend at $indexUrl..."
    try {
        $content = Invoke-WebRequest -Uri $indexUrl -UseBasicParsing -ErrorAction Stop
        if ($content.StatusCode -eq 200) {
            Write-Host "✅ Frontend check passed!" -ForegroundColor Green
        } else {
            Write-Error "❌ Frontend check failed with status $($content.StatusCode)"
        }
    } catch {
        Write-Error "❌ Frontend check failed: $_"
    }

} catch {
    Write-Error "❌ Verification failed: $_"
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Server stopped."
    }
}
