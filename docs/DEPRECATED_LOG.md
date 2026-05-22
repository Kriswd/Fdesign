# 🏛️ Deprecated Features & Decisions Log
*Store obsolete technical decisions here to prevent re-implementing failed ideas.*

## [2024-01-17] Deprecated Backend-Side Ghost Busting
* **Status**: Removed. Backend is now a dumb executor.
* **Old Logic**: Backend tried to validate layer IDs against a local `manifest.json`.
* **Why Removed**: Backend state lag caused valid frontend edits to be rejected. "Ghost layers" are a frontend concept; backend shouldn't care.
* **New Logic**: Frontend sends `updates` list with `psId`. Backend executes blindly.
* **Lesson**: The Frontend is the Single Source of Truth for user intent. Backend should be stateless.

## [2024-01-16] Reverted Aggressive Color Filtering (MAD/Diff)
* **Status**: Reverted to minimal filtering (Hidden/Size/Alpha only).
* **Old Logic**: Used `Dynamic Diff > 180` and `MAD < 15` to detect "solid color" placeholders.
* **Why Removed**: It deleted valid product images (e.g., sunglasses) that had low texture variance or were interpreted as solid blocks by the parser.
* **Lesson**: "Better to keep trash than delete assets." Visual uniformity != junk.

## [2024-01-15] Removed "Values Mapping" Logic
* **Status**: Deprecated in favor of `Updates` array pattern.
* **Old Logic**: Frontend sent a full key-value map `{ layerName: value }` + `variables` list.
* **Why Removed**: It caused ambiguity when dealing with duplicate layers. The new `psId` based update system is more robust.
* **Lesson**: Do not rely on layer names for linking; always use unique `psId`.

## [2024-01-14] Refactored Hardcoded Layer Rules
* **Status**: Moved to `src/config/layerRules.js`.
* **Old Logic**: Keywords like `'copy'`, `'color'` and thresholds were hardcoded in `psdParser.js`.
* **Why Removed**: Hard to maintain and adjust without code changes.
* **Lesson**: Configuration over Code.

## [2023-12-XX] Dropped "Fixed 4x4 Bento Grid"
* **Status**: Replaced by Responsive 12-col Grid.
* **Old Logic**: Fixed `grid-template-rows: repeat(4, 1fr)` and fixed height.
* **Why Removed**: Content overflowed; layout broke on small screens.

## [2023-12-XX] Dropped "Direct File Watcher"
* **Status**: Removed.
* **Why**: Photoshop locks files unpredictably. Switched to explicit HTTP triggers.

## [2023-12-XX] Upload Size Limit 50MB
* **Status**: Increased to 2GB.
* **Why**: Real-world e-commerce PSDs often exceeded the default limit.
