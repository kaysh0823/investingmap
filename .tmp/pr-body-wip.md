## Summary

- Temporarily disables the relationship network graph tab across all 22 sector maps while value-chain data is revised.
- Shows a bilingual WIP placeholder instead of graph scaffolding (toolbar, nodes, SVG).
- Tab labels updated to **관계 네트워크 (수정중)** / **Relationship network (WIP)**.
- Bumps shared `relation_network.js` asset version to **v4** for cache busting.
- Graph-dependent npm verify scripts temporarily skip via `skip_rn_wip_verify.mjs`.

## Restore

Set `var RN_WIP = false;` in `js/relation_network.js` when development resumes.

## Data impact

- No relationship network JSON, cp_list, or snapshot changes.

## Deployment

Merging to `main` triggers Cloudflare Pages production deployment.
