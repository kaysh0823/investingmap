## Summary

- Prioritizes listed-company names across all 22 relationship-network sectors.
- Removes non-constituent nodes that are connected only through hidden peer/reference edges.
- Adds density-aware label priority, collision handling, and semantic zoom.
- Prevents dense graphs from shrinking all labels to unreadable sizes.
- Adds minimum initial zoom, virtual lane height, improved typography, and selection-focused edge emphasis.
- Bumps the shared relationship-network asset version to v3.

## Readability changes

- Listed-company labels render at 12–13px.
- Selected, hovered, focused, and directly related labels receive highest priority.
- Global/reference labels appear only when space and zoom level allow.
- Labels use a contrast halo for readability over edges.
- Collision detection runs after layout stabilization, not on every simulation tick.
- Dense lane layouts use increased spacing and virtual height.
- Full fit remains available through the explicit fit-all control.

## Mobile

- Uses a higher minimum zoom.
- Prioritizes the selected company and direct neighbors.
- Keeps low-priority peer/reference labels hidden by default.
- Preserves filter drawer and detail-sheet behavior.

## Validation

- Build completed twice without drift.
- Asset-version validation passed for all 22 sectors.
- Readability browser cases passed.
- Browser release gate passed 132/132 cases.
- App failures: 0.
- Infrastructure failures: 0.
- Skips/retries: 0.

## Data impact

- Relationship network JSON changes: none.
- cp_list changes: none.
- Market snapshot changes: none.
- Evidence/status/metrics changes: none.

## Cache

All 22 sector pages now load `relation_network.js?v=3`.

## Deployment

Merging to main triggers Cloudflare Pages production deployment. No manual deploy or snapshot refresh is required.
