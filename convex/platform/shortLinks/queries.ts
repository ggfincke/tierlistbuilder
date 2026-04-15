// convex/platform/shortLinks/queries.ts
// short link queries — stubbed; real implementation lands in short link PR

import { query } from '../../_generated/server'
import { v } from 'convex/values'

// resolve a short slug to its target board or signed snapshot blob URL
// todo: implement in short link PR
export const resolveSlug = query({
  args: { slug: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: resolveSlug — short link PR')
  },
})
