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
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $pages = & gh api "repos/$Repo/pages" --jq '.html_url' 2>$null
    $pagesExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($pagesExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($pages)) {
    Write-Host "GitHub Pages exists: $pages"
    return
  }

  $pageCreateOutput = & gh api -X POST "repos/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/docs'
  if ($LASTEXITCODE -ne 0) {
    throw "gh pages setup failed for $Repo"
  }
  [void]$pageCreateOutput
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
Ensure-Label -Name 'quickstart-feedback' -Color '1d76db' -Description 'First-run feedback from the Chinese quick start.'

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

Please do not upload private PSD files, product images, paid fonts, credentials, or unredacted private workflow details.
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

$quickstartCnBody = @'
中文快速试跑反馈集中帖：

如果你是第一次在 Windows + Photoshop 环境里启动 Fdesign，可以先按 docs/QUICKSTART_CN.md 走一遍。

请优先反馈这些信息：

- npm install / npm run server / npm run dev 卡在哪一步。
- http://127.0.0.1:3001/health 是否能返回 JSON。
- Photoshop 是否能手动打开，是否卡在登录、授权、更新或弹窗。
- 公开演示包是否能帮你理解 Excel 字段、PSD 变量和商品图的关系。
- 哪一步会影响你继续试用、Star、分享或提交 PR。

请不要上传真实 PSD 模板、真实商品图、账号信息、token、店铺后台截图、授权不清素材或未净化字段。更完整的反馈可以使用中文试跑反馈模板：
https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml
'@

Ensure-Issue -Title 'Roadmap: V3.0 ecommerce PSD automation workflow' -Body $roadmapBody -Labels @('roadmap', 'help wanted')
Ensure-Issue -Title 'Showcase request: share sanitized ecommerce PSD workflows' -Body $showcaseBody -Labels @('showcase', 'help wanted')
Ensure-Issue -Title 'Good first issue: improve quick start from a fresh Windows run' -Body $docsBody -Labels @('good first issue', 'documentation')
Ensure-Issue -Title 'Launch feedback: README, demo, and first-run clarity' -Body $feedbackBody -Labels @('launch-feedback', 'documentation')
Ensure-Issue -Title 'Quickstart CN feedback: Windows + Photoshop 首次启动' -Body $quickstartCnBody -Labels @('quickstart-feedback', 'documentation', 'help wanted')

Write-Host "GitHub growth setup completed for $Repo"
