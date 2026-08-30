# Relation Network Asset Cache Bust Hotfix

**Date:** 2026-08-30  
**Branch:** `hotfix/relation-network-cache-bust-v2`  
**Base:** `3ffc612` (PR #2 filter sidebar merge)

## Issue

After PR #2, Cloudflare continued serving cached `relation_network.js?v=1` (175 KB, no `setupWorkspaceLayout`). New HTML sidebar shells loaded, but stale JS left an empty desktop sidebar and no mobile filter drawer.

## Fix

- Added `lib/relation_network/asset_version.mjs` with `RELATION_NETWORK_ASSET_VERSION = '2'`.
- Updated `scripts/patch_relation_network.mjs` to emit `relation_network.js?v=2` from the shared constant.
- Regenerated all 22 active sector HTML pages via build.
- Added `verify:relation-network-asset-version` to fail on stale `?v=1` references or duplicate/missing script includes.

## Out of scope

- No changes to `js/relation_network.js` logic
- No network JSON, cp_list, or snapshot updates

## Validation

- 22/22 sector HTML → `relation_network.js?v=2`
- 0 stale `?v=1` references in sector HTML
- Targeted browser smoke: nuclear/finance/construction/robot/cosmetics — PASS
- Static verifiers: relation-network, dist, nav-tab-preserve, data-sector-profile, asset-version — PASS
