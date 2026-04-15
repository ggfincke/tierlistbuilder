// convex/getHealth.ts
// * foundation PR smoke test — minimal end-to-end query w/ no auth required
// lets us verify the pipe (frontend → convex → schema) is wired before any
// real feature lands. safe to remove once a real feature query replaces it

import { query } from './_generated/server'

// reports basic deployment health; used by the smoke test to confirm
// queries reach the convex runtime & return typed results
export const getHealth = query({
  args: {},
  handler: async () =>
  {
    return {
      status: 'ok' as const,
      serverTime: Date.now(),
      schemaVersion: 1,
    }
  },
})
