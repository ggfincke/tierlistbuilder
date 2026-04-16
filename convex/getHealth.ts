// convex/getHealth.ts
// smoke test query — verifies frontend -> convex -> schema wiring w/ no auth.
// safe to remove when real feature queries land

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
