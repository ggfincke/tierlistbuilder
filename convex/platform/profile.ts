// convex/platform/profile.ts
// public profile reads (/u/:handle) — identity, tlotl showcase, & authored templates

import { v, type Infer } from 'convex/values'
import { query, type QueryCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import type { PublicUserProfile } from '@tierlistbuilder/contracts/platform/profile'
import { marketplaceTemplateSummaryValidator } from '../lib/validators/marketplace'
import { resolveUserAvatarUrl } from '../lib/avatar'
import { toTemplateCardSummary } from '../marketplace/templates/lib/projections'
import { createTemplateProjectionCache } from '../marketplace/templates/lib/trending'
import { buildPublicShowcase, publicProfileShowcaseValidator } from './showcase'

type ProjectionCache = ReturnType<typeof createTemplateProjectionCache>

// authored-templates grid cap; hasMoreTemplates flags when the author has more
const PROFILE_TEMPLATES_LIMIT = 24

const publicUserProfileValidator = v.object({
  id: v.string(),
  handle: v.string(),
  displayName: v.union(v.string(), v.null()),
  bio: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  pronouns: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  plan: v.union(v.literal('free'), v.literal('plus')),
  createdAt: v.number(),
  showcase: v.union(publicProfileShowcaseValidator, v.null()),
  templates: v.array(marketplaceTemplateSummaryValidator),
  hasMoreTemplates: v.boolean(),
})

// drift guard: PublicUserProfile (TS contract) & the runtime validator must
// stay structurally identical — same pattern as getMe in users.ts
type _PublicUserProfileMatchesValidator =
  PublicUserProfile extends Infer<typeof publicUserProfileValidator>
    ? Infer<typeof publicUserProfileValidator> extends PublicUserProfile
      ? true
      : false
    : false
const _publicUserProfileContractCheck: _PublicUserProfileMatchesValidator = true
void _publicUserProfileContractCheck

const resolveAuthoredTemplates = async (
  ctx: QueryCtx,
  userId: Id<'users'>,
  cache: ProjectionCache
) =>
{
  const rows = await ctx.db
    .query('templateCards')
    .withIndex('byAuthorIsPubliclyListableUpdatedAt', (q) =>
      q.eq('authorId', userId).eq('isPubliclyListable', true)
    )
    .order('desc')
    .take(PROFILE_TEMPLATES_LIMIT + 1)
  const hasMore = rows.length > PROFILE_TEMPLATES_LIMIT
  const visible = rows.slice(0, PROFILE_TEMPLATES_LIMIT)
  const templates = await Promise.all(
    visible.map((row) => toTemplateCardSummary(ctx, row, cache))
  )
  return { templates, hasMore }
}

export const getPublicProfileByHandle = query({
  args: { handle: v.string() },
  returns: v.union(publicUserProfileValidator, v.null()),
  handler: async (ctx, args): Promise<PublicUserProfile | null> =>
  {
    const handle = args.handle.trim().toLowerCase()
    if (!handle) return null

    const user = await ctx.db
      .query('users')
      .withIndex('byHandle', (q) => q.eq('handle', handle))
      .unique()
    if (!user || !user.handle) return null

    const cache = createTemplateProjectionCache()
    const [showcase, authored, avatarUrl] = await Promise.all([
      buildPublicShowcase(ctx, user._id),
      resolveAuthoredTemplates(ctx, user._id, cache),
      resolveUserAvatarUrl(ctx, user),
    ])

    return {
      id: user._id,
      handle: user.handle,
      displayName: user.displayName ?? user.name ?? null,
      bio: user.bio ?? null,
      location: user.location ?? null,
      pronouns: user.pronouns ?? null,
      avatarUrl,
      plan: user.plan ?? 'free',
      createdAt: user.createdAt ?? user._creationTime,
      showcase,
      templates: authored.templates,
      hasMoreTemplates: authored.hasMore,
    }
  },
})
