# Open Source Growth Implementation

Date: 2026-06-16

## Summary

Implemented the approved public open-source assets for Fdesign V3.0: value-led README, demo docs, roadmap, release notes, GitHub templates, and repeatable GitHub setup script.

## Changes

- README now leads with the ecommerce production outcome: Excel product data to batch PSD deliverables.
- Store link remains a secondary service entry after quick start and contribution content.
- Added public demo and roadmap docs under `docs/`.
- Added GitHub issue/discussion templates and a setup script for metadata, labels, issues, and Discussions.
- Hardened the setup script on Windows by using the GitHub search API for title checks, avoiding `gh issue list --search` argument splitting when issue titles contain spaces or quotes.
- Added `tests/open_source_growth_readme.test.mjs` to lock the public-growth contract.
- Tightened ESLint global ignores so local historical/untracked build directories do not break repository-level lint verification.

## Verification

- `npm test -- --test-name-pattern "README 首屏|公开增长|GitHub 社区"`
- `npm run lint`
- `npm run build`
- `npm test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup_github_growth.ps1`
- Remote GitHub verification after push: public visibility, metadata, release, labels, seed issues, Discussions, and star baseline 0.

## Risk

Low. This change is public documentation and repository setup only. It does not change PSD parsing, Photoshop export, frontend runtime behavior, authentication, or release packaging.
