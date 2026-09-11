/**
 * Ship chain persistence — delegates to §0-4C mobility reclass (8 groups).
 * Keeps the historical script entrypoint used by rebuild_site.mjs.
 */
import { applySector } from './apply_mobility_04c_chain_reclass.mjs';

applySector('ship');
console.log('OK apply_ship_chain_reclass (delegated to mobility_04c)');
