// convex/lib/marketplaceLookups.ts
// cycle-free marketplace row lookups shared by lib & marketplace modules

import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type DbCtx = QueryCtx | MutationCtx

export const findTemplateBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'templates'> | null> =>
  await ctx.db
    .query('templates')
    .withIndex('bySlug', (q) => q.eq('slug', slug))
    .unique()

export const findRankingBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'publishedRankings'> | null> =>
  await ctx.db
    .query('publishedRankings')
    .withIndex('bySlug', (q) => q.eq('slug', slug))
    .unique()
