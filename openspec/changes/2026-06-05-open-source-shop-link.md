# 2026-06-05 open source shop link

## Summary

- Add a configurable top-header shop CTA for users who need purchase or service entry points.
- Keep the public repository clean by reading the real URL from environment variables instead of hard-coding a private shop link.

## Implementation

- Add `src/components/ShopLinkButton.jsx`.
- Mount the CTA in both the routed workbench shell and the legacy `/slot` shell.
- Read the shop URL and label from Vite environment variables:
  - `VITE_SHOP_URL`
  - `VITE_SHOP_LINK_LABEL`
- Hide the CTA when `VITE_SHOP_URL` is empty or not an `http(s)` URL, so the public repository does not hard-code a private shop URL.
- Document the configuration in `.env.example`, README, `docs/OPEN_SOURCE_CHECKLIST.md`, and `CHANGELOG_V3.0.md`.
- Add `tests/open_source_shop_link.test.mjs` to keep the open-source behavior explicit.
