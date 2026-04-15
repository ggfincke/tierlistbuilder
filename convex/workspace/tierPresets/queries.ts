// convex/workspace/tierPresets/queries.ts
// tier preset queries — all stubbed; real implementations land in the presets sync PR

import { query } from '../../_generated/server'

// list the authenticated caller's saved tier presets
// built-in presets stay client-side & are not included in this query
// todo: implement in tier preset sync PR
export const getMyTierPresets = query({
  args: {},
  handler: async () =>
  {
    throw new Error('not implemented: getMyTierPresets — presets sync PR')
  },
})
