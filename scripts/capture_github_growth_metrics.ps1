param(
  [string]$Repo = 'Kriswd/Fdesign',
  [string]$OutDir = 'output/github-growth-metrics'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Split-RepoName {
  param([string]$FullName)

  $parts = $FullName.Split('/')
  if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0]) -or [string]::IsNullOrWhiteSpace($parts[1])) {
    throw "Repo must be in owner/name form, got: $FullName"
  }
  return [pscustomobject]@{
    Owner = $parts[0]
    Name = $parts[1]
  }
}

function Invoke-GhJson {
  param([string[]]$Arguments)

  $output = & gh @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    return [pscustomobject]@{
      ok = $false
      error = ($output -join "`n")
    }
  }

  $text = ($output -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return [pscustomobject]@{
      ok = $true
      data = $null
    }
  }

  return [pscustomobject]@{
    ok = $true
    data = ($text | ConvertFrom-Json)
  }
}

function Get-TrafficMetric {
  param(
    [string]$Repo,
    [string]$Endpoint
  )

  Invoke-GhJson @('api', "repos/$Repo/traffic/$Endpoint")
}

$repoName = Split-RepoName -FullName $Repo
$generatedAt = (Get-Date).ToUniversalTime().ToString('o')
$dateStamp = (Get-Date).ToString('yyyy-MM-dd')
$timeStamp = (Get-Date).ToString('yyyyMMdd-HHmmss')

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$repoResult = Invoke-GhJson @('api', "repos/$Repo")
if (-not $repoResult.ok) {
  throw "Failed to read repository: $($repoResult.error)"
}

$graphqlQuery = @'
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    stargazerCount
    forkCount
    watchers {
      totalCount
    }
    issues(states: OPEN) {
      totalCount
    }
    pullRequests(states: OPEN) {
      totalCount
    }
    discussions {
      totalCount
    }
    releases {
      totalCount
    }
  }
}
'@

$graphResult = Invoke-GhJson @(
  'api',
  'graphql',
  '-f', "query=$graphqlQuery",
  '-F', "owner=$($repoName.Owner)",
  '-F', "name=$($repoName.Name)"
)

$pagesResult = Invoke-GhJson @('api', "repos/$Repo/pages")
$latestReleaseResult = Invoke-GhJson @('api', "repos/$Repo/releases/latest")
$viewsResult = Get-TrafficMetric -Repo $Repo -Endpoint 'views'
$clonesResult = Get-TrafficMetric -Repo $Repo -Endpoint 'clones'
$referrersResult = Get-TrafficMetric -Repo $Repo -Endpoint 'popular/referrers'
$pathsResult = Get-TrafficMetric -Repo $Repo -Endpoint 'popular/paths'

$graphRepo = $null
if ($graphResult.ok -and $null -ne $graphResult.data.data.repository) {
  $graphRepo = $graphResult.data.data.repository
}

$views = $null
if ($viewsResult.ok) { $views = $viewsResult.data }
$clones = $null
if ($clonesResult.ok) { $clones = $clonesResult.data }

$summary = [pscustomobject]@{
  generated_at = $generatedAt
  repo = $Repo
  html_url = $repoResult.data.html_url
  homepage = $repoResult.data.homepage
  is_private = $repoResult.data.private
  default_branch = $repoResult.data.default_branch
  stars = if ($null -ne $graphRepo) { $graphRepo.stargazerCount } else { $repoResult.data.stargazers_count }
  forks = if ($null -ne $graphRepo) { $graphRepo.forkCount } else { $repoResult.data.forks_count }
  watchers = if ($null -ne $graphRepo) { $graphRepo.watchers.totalCount } else { $repoResult.data.subscribers_count }
  open_issues = if ($null -ne $graphRepo) { $graphRepo.issues.totalCount } else { $repoResult.data.open_issues_count }
  open_pull_requests = if ($null -ne $graphRepo) { $graphRepo.pullRequests.totalCount } else { $null }
  discussions = if ($null -ne $graphRepo) { $graphRepo.discussions.totalCount } else { $null }
  releases = if ($null -ne $graphRepo) { $graphRepo.releases.totalCount } else { $null }
  latest_release = if ($latestReleaseResult.ok -and $null -ne $latestReleaseResult.data) { $latestReleaseResult.data.tag_name } else { $null }
  pages_status = if ($pagesResult.ok -and $null -ne $pagesResult.data) { $pagesResult.data.status } else { $null }
  pages_url = if ($pagesResult.ok -and $null -ne $pagesResult.data) { $pagesResult.data.html_url } else { $null }
  views_total = if ($null -ne $views) { $views.count } else { $null }
  views_unique = if ($null -ne $views) { $views.uniques } else { $null }
  clones_total = if ($null -ne $clones) { $clones.count } else { $null }
  clones_unique = if ($null -ne $clones) { $clones.uniques } else { $null }
}

$payload = [pscustomobject]@{
  summary = $summary
  traffic_window = 'GitHub traffic endpoints return the last 14 days where available.'
  traffic = [pscustomobject]@{
    views = $viewsResult
    clones = $clonesResult
    referrers = $referrersResult
    paths = $pathsResult
  }
  graphql = $graphResult
  pages = $pagesResult
  latest_release = $latestReleaseResult
}

$jsonPath = Join-Path $OutDir "github-growth-$timeStamp.json"
$csvPath = Join-Path $OutDir 'github-growth-summary.csv'

$payload | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$csvRow = [pscustomobject]@{
  date = $dateStamp
  generated_at = $generatedAt
  repo = $Repo
  stars = $summary.stars
  forks = $summary.forks
  watchers = $summary.watchers
  open_issues = $summary.open_issues
  open_pull_requests = $summary.open_pull_requests
  discussions = $summary.discussions
  latest_release = $summary.latest_release
  pages_status = $summary.pages_status
  views_total = $summary.views_total
  views_unique = $summary.views_unique
  clones_total = $summary.clones_total
  clones_unique = $summary.clones_unique
}

if (Test-Path -LiteralPath $csvPath) {
  $csvRow | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8 -Append
} else {
  $csvRow | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
}

Write-Host "GitHub growth metrics captured:"
Write-Host "  JSON: $jsonPath"
Write-Host "  CSV:  $csvPath"
Write-Host "  Stars: $($summary.stars)"
Write-Host "  Forks: $($summary.forks)"
Write-Host "  Views last 14 days: $($summary.views_total) total / $($summary.views_unique) unique"
Write-Host "  Clones last 14 days: $($summary.clones_total) total / $($summary.clones_unique) unique"
