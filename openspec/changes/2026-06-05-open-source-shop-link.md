# 2026-06-05 open source shop link

## Summary

- Add a top-header shop CTA for users who need purchase or service entry points.
- Default the public shop URL to `https://pay.ldxp.cn/shop/FTIWLFHQ`, while keeping environment variable override support for deployments that need a different shop.

## Implementation

- Add `src/components/ShopLinkButton.jsx`.
- Mount the CTA in both the routed workbench shell and the legacy `/slot` shell.
- Default the shop URL to `https://pay.ldxp.cn/shop/FTIWLFHQ`.
- Allow deployments to override the shop URL and label from Vite environment variables:
  - `VITE_SHOP_URL`
  - `VITE_SHOP_LINK_LABEL`
- Hide the CTA when the resolved shop URL is not an `http(s)` URL.
- Document the configuration in `.env.example`, README, `docs/OPEN_SOURCE_CHECKLIST.md`, and `CHANGELOG_V3.0.md`.
- Add `tests/open_source_shop_link.test.mjs` to keep the open-source behavior explicit.
