# Growth Distribution Kit

Date: 2026-06-16

## Summary

Added a channel-by-channel distribution kit for the Fdesign V3.0 open-source launch so the project can continue toward 1000 real GitHub stars through traceable, non-spammy distribution.

## Changes

- Added `docs/launch/distribution_targets.md` with prioritized channels, platform constraints, launch order, and explicit anti-fake-star rules.
- Added `docs/launch/utm_links.md` with canonical links, campaign links, and the Product Hunt no-UTM exception.
- Added `docs/launch/post_templates.md` with ready-to-adapt Chinese and English launch copy for V2EX, Juejin, communities, HN, Product Hunt, Reddit, and short video.
- Added `docs/launch/first_30_days_growth_plan.md` with weekly actions, success metrics, stop rules, and the reminder that the 1000-star goal is not complete yet.
- Added `scripts/capture_github_growth_metrics.ps1` to capture GitHub stars, forks, issues, discussions, release, Pages, and 14-day traffic metrics into ignored local output.
- Added `tests/open_source_distribution_kit.test.mjs` to lock the public distribution assets and metric script contract.

## Verification

- `npm test -- --test-name-pattern "分发|UTM|发布文案|30 天|增长指标"`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture_github_growth_metrics.ps1`

## Risk

Low. The change adds documentation and a local metric collection script. It does not change the app runtime, PSD export behavior, backend API, release packaging, or GitHub repository settings.
