export function normalizeSectorWeighting(value) {
  return value === 'equal' ? 'equal' : 'cap';
}

// Separate keys in the existing (sector_id, ts) capture store; old cap keys stay valid.
export function sectorCaptureKey(sector, weighting = 'cap') {
  return normalizeSectorWeighting(weighting) === 'equal' ? `equal:${sector}` : sector;
}

export function sectorFromCaptureKey(key, weighting = 'cap') {
  const value = String(key || '');
  if (normalizeSectorWeighting(weighting) === 'equal') return value.startsWith('equal:') ? value.slice(6) : null;
  return value.startsWith('equal:') ? null : value;
}
