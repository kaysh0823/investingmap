/** Deterministic cache-bust version for shared relation-network browser assets. */
export const RELATION_NETWORK_ASSET_VERSION = '3';

export function relationNetworkJsRef() {
  return `relation_network.js?v=${RELATION_NETWORK_ASSET_VERSION}`;
}

export function relationNetworkScriptSrc() {
  return `../js/${relationNetworkJsRef()}`;
}
