# GitHub Pages Growth Landing

Date: 2026-06-16

## Summary

Added a static GitHub Pages landing page for Fdesign V3.0 so launch traffic can use a shareable product-first URL instead of only the GitHub README.

## Changes

- Added `docs/index.html` with a screenshot-backed hero, workflow explanation, quick start, and Star-first GitHub CTA.
- Copied the public workbench screenshot to `docs/assets/fdesign-workbench-showcase.png` for GitHub Pages hosting.
- Updated README and `package.json` homepage to `https://kriswd.github.io/Fdesign/`.
- Extended `scripts/setup_github_growth.ps1` to configure repository homepage and enable GitHub Pages from the `main` branch `/docs` folder.
- Extended public growth tests to lock the landing page, screenshot asset, GitHub CTA, and secondary service placement.

## Verification

- `npm test -- --test-name-pattern "GitHub Pages|公开增长|GitHub 社区"`
- `npm run lint`
- `npm run build`
- `npm test`
- Remote GitHub verification after push: Pages configuration, repository homepage, release, and star baseline.

## Risk

Low. The change adds a static public landing page and repository setup automation. It does not change the app runtime, PSD parsing, Photoshop export, backend API, or release packaging.
