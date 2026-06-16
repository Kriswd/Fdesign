param(
  [string]$Repo = 'Kriswd/Fdesign'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PagesUrl = 'https://kriswd.github.io/Fdesign/'

function Invoke-Gh {
  param([string[]]$Arguments)

  & gh @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gh command failed: gh $($Arguments -join ' ')"
  }
}

function Ensure-Label {
  param(
    [string]$Name,
    [string]$Color,
    [string]$Description
  )

  Invoke-Gh @('label', 'create', $Name, '-R', $Repo, '--color', $Color, '--description', $Description, '--force')
}

function Test-IssueExists {
  param([string]$Title)

  $query = [System.Uri]::EscapeDataString("repo:$Repo is:issue in:title `"$Title`"")
  $titles = & gh api "search/issues?q=$query&per_page=100" --jq '.items[].title'
  if ($LASTEXITCODE -ne 0) {
    throw "gh issue search failed for: $Title"
  }
  if ([string]::IsNullOrWhiteSpace($titles)) {
    return $false
  }
  return (@($titles | Where-Object { $_ -eq $Title }).Count -gt 0)
}

function Ensure-Issue {
  param(
    [string]$Title,
    [string]$Body,
    [string[]]$Labels
  )

  if (Test-IssueExists -Title $Title) {
    Write-Host "Issue exists: $Title"
    return
  }

  $args = @('issue', 'create', '-R', $Repo, '--title', $Title, '--body', $Body)
  foreach ($label in $Labels) {
    $args += @('--label', $label)
  }
  # gh issue create is invoked through the argument array above.
  Invoke-Gh $args
}

function Ensure-GitHubPages {
  $pages = & gh api "repos/$Repo/pages" --jq '.html_url' 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($pages)) {
    Write-Host "GitHub Pages exists: $pages"
    return
  }

  & gh api -X POST "repos/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/docs'
  if ($LASTEXITCODE -ne 0) {
    throw "gh pages setup failed for $Repo"
  }
  Write-Host "GitHub Pages enabled: $PagesUrl"
}

Write-Host "Configuring repository metadata for $Repo"

# Equivalent direct command: gh repo edit Kriswd/Fdesign --enable-discussions --add-topic photoshop-automation
Invoke-Gh @(
  'repo', 'edit', $Repo,
  '--description', 'Open-source Photoshop + Excel PSD automation workbench for ecommerce image production.',
  '--homepage', $PagesUrl,
  '--enable-issues',
  '--enable-discussions',
  '--add-topic', 'photoshop-automation',
  '--add-topic', 'psd-automation',
  '--add-topic', 'ecommerce-tools',
  '--add-topic', 'batch-image-processing',
  '--add-topic', 'excel',
  '--add-topic', 'design-automation',
  '--add-topic', 'windows',
  '--add-topic', 'react',
  '--add-topic', 'nodejs'
)

Ensure-GitHubPages

Ensure-Label -Name 'good first issue' -Color '7057ff' -Description 'Small, well-scoped tasks for new contributors.'
Ensure-Label -Name 'help wanted' -Color '008672' -Description 'Useful contributions from the community are welcome.'
Ensure-Label -Name 'documentation' -Color '0075ca' -Description 'Documentation, demo, README, or troubleshooting improvements.'
Ensure-Label -Name 'showcase' -Color '0e8a16' -Description 'Sanitized template/workflow examples from users.'
Ensure-Label -Name 'roadmap' -Color '5319e7' -Description 'Public roadmap and planning topics.'
Ensure-Label -Name 'launch-feedback' -Color 'fbca04' -Description 'Feedback from the V3.0 open-source launch.'

$roadmapBody = @'
Fdesign V3.0 is now positioned around one public workflow: Excel product data -> batch PSD deliverables.

Current roadmap anchors:

- Make quick start easier for Windows + Photoshop users.
- Collect sanitized ecommerce PSD template examples.
- Improve troubleshooting docs for Photoshop export failures.
- Add a stronger screenshot/GIF walkthrough after first launch feedback.

Please comment with the workflow that would make Fdesign more useful for your team.
'@

$showcaseBody = @'
We are collecting sanitized template examples for ecommerce image production.

Useful examples:

- Product detail page templates.
- Marketplace main image templates.
- Campaign/social image templates.
- Excel field mapping examples.

Please do not upload private PSD files, product images, paid fonts, credentials, or sensitive business information.
'@

$docsBody = @'
Good first contribution:

1. Follow the README quick start on Windows.
2. Note the first unclear step.
3. Open a PR that improves README, docs/DEMO.md, or docs/ROADMAP.md.

Keep changes small and focused. Screenshots are welcome if they do not contain private data.
'@

$feedbackBody = @'
Use this issue to report V3.0 launch feedback:

- What made the project easy or hard to understand?
- Did the README first screen explain the workflow?
- Did the Windows + Photoshop requirement appear early enough?
- What would make you star, try, or share the repo?

Please include only public-safe examples.
'@

Ensure-Issue -Title 'Roadmap: V3.0 ecommerce PSD automation workflow' -Body $roadmapBody -Labels @('roadmap', 'help wanted')
Ensure-Issue -Title 'Showcase request: share sanitized ecommerce PSD workflows' -Body $showcaseBody -Labels @('showcase', 'help wanted')
Ensure-Issue -Title 'Good first issue: improve quick start from a fresh Windows run' -Body $docsBody -Labels @('good first issue', 'documentation')
Ensure-Issue -Title 'Launch feedback: README, demo, and first-run clarity' -Body $feedbackBody -Labels @('launch-feedback', 'documentation')

Write-Host "GitHub growth setup completed for $Repo"
