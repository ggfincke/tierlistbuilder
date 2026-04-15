// convex/workspace/settings/mutations.ts
// user settings mutations — stubbed; real implementation lands in settings sync PR

import { mutation } from '../../_generated/server'
import { appSettingsValidator } from '../../lib/validators'

// upsert the authenticated caller's AppSettings — replaces any existing row
// todo: implement in settings sync PR w/ debounced write from the frontend
export const upsertMySettings = mutation({
  args: { settings: appSettingsValidator },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: upsertMySettings — settings sync PR')
  },
})
