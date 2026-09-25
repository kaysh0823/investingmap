/**
 * Unit test: Prefer count=exact only when warnIfTruncated (non-paginate) or preferCountExact===true.
 */
import assert from 'assert';
import { buildSupabasePreferHeaders } from '../functions/lib/supabase_hub.mjs';

assert.deepStrictEqual(buildSupabasePreferHeaders({}), {}, 'default: no Prefer');
assert.deepStrictEqual(
  buildSupabasePreferHeaders({ preferCountExact: false }),
  {},
  'preferCountExact false: no Prefer',
);
assert.deepStrictEqual(
  buildSupabasePreferHeaders({ preferCountExact: true }),
  { Prefer: 'count=exact' },
  'preferCountExact true: Prefer set',
);
assert.deepStrictEqual(
  buildSupabasePreferHeaders({ warnIfTruncated: 'truncated' }),
  { Prefer: 'count=exact' },
  'warnIfTruncated: Prefer set',
);
assert.deepStrictEqual(
  buildSupabasePreferHeaders({ warnIfTruncated: 'truncated', paginate: true }),
  {},
  'warnIfTruncated + paginate: no Prefer (paginate path handles its own pages)',
);
assert.deepStrictEqual(
  buildSupabasePreferHeaders({ preferCountExact: true, paginate: true }),
  { Prefer: 'count=exact' },
  'preferCountExact true wins even if paginate flag present on opts object',
);

console.log('OK verify_supabase_hub_prefer');
