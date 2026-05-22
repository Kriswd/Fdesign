Change: Prepare V3.0 branding and open-source readiness

- Bump application release metadata from `2.9` to `3.0` in package metadata, frontend titles, launcher titles, and regression assertions.
- Expose backend application version through `/health.version`, sourced from `package.json`.
- Add a dedicated `public/fdesign-logo.svg` and reuse it for both browser favicon and workbench header brand mark.
- Remove unused Vite/React scaffold assets and tighten open-source hygiene rules in `.gitignore`.
- Add `docs/OPEN_SOURCE_CHECKLIST.md` and `CHANGELOG_V3.0.md` to document public-release work.
- Remove proposal, quote-generation, packaged quote, backup archive, tracked cache, workflow screenshot, and internal release-note materials from the public tree.
- Add MIT `LICENSE`, `.env.example`, `CONTRIBUTING.md`, `SECURITY.md`, and package repository metadata for the public repository.
- Refresh audit-fixable dependency locks and move SheetJS `xlsx` to the official 0.20.3 tarball source used by the public dependency tree.
- Publish through a sanitized public history so prior private workspace materials are not exposed by a repository visibility flip.
