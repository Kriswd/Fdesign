# China Growth Playbook

Date: 2026-06-22

## Summary

Added a China-focused growth playbook for Fdesign so the 10,000-star objective has domestic channel strategy, content cadence, platform-specific copy, and a scorecard for weekly review.

## Changes

- Added `docs/launch/china_growth_playbook.md` with domestic audience segmentation, channel strategy, 10,000-star route, and anti-spam stop rules.
- Added `docs/launch/china_content_calendar.md` with a 30-day domestic content calendar across communities, V2EX, Juejin, Zhihu, Bilibili, Xiaohongshu, WeChat, and domestic open-source communities.
- Added `docs/launch/china_post_templates.md` with platform-specific Chinese templates and compliance notes.
- Added `docs/launch/china_growth_scorecard.md` to evaluate domestic channel quality by stars, views, clones, issues, discussions, and feedback quality.
- Updated README, launch kit, distribution targets, UTM links, open-source checklist, changelog, dev log, and growth tests to reference the domestic playbook.

## Verification

- `npm test -- --test-name-pattern "国内|UTM|30 天|分发"`
- `npm run lint`
- `npm test`

## Risk

Low. This is documentation and test coverage for open-source growth operations. It does not change frontend runtime, backend API, Photoshop export behavior, package build, or repository settings.
