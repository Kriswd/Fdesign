Change: Release metadata should be bumped to V2.9 consistently

- Bump the application version in `package.json` and root `package-lock.json` metadata from the previous release marker to `2.9`.
- Update all user-facing product titles and launcher titles from `V2.8` to `V2.9` so the app shell, workbench, and release entry points present a consistent version.
- Update release regression assertions so the version contract is checked automatically before packaging.
