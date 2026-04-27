// convex/users.ts
// * user queries & account-management mutations — getMe, updateProfile,
// updateHandle, signOutEverywhere, deleteAccount (kicks off phased cascade)

import { ConvexError, v } from 'convex/values'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  getCurrentUser,
  requireCurrentUserId,
} from './lib/auth'
import { BATCH_LIMITS } from './lib/limits'
import {
  adjustPublicTemplateCount,
  type PublicCategoryDelta,
} from './marketplace/templates/lib'

const MAX_DISPLAY_NAME_LEN = 64
const MAX_BIO_LEN = 200
const MAX_LOCATION_LEN = 80
const MAX_WEBSITE_LEN = 200
const MAX_PRONOUNS_LEN = 32
const MIN_HANDLE_LEN = 3
const MAX_HANDLE_LEN = 24
const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/
// reserved at the URL-routing level — these would collide w/ app routes if
// we let users claim them as @handles. expand as we add public surfaces
const RESERVED_HANDLES = new Set<string>([
  'about',
  'account',
  'admin',
  'api',
  'auth',
  'board',
  'boards',
  'dashboard',
  'help',
  'home',
  'legal',
  'login',
  'logout',
  'marketplace',
  'me',
  'preferences',
  'privacy',
  'profile',
  'root',
  'settings',
  'signin',
  'signout',
  'signup',
  'support',
  'system',
  'template',
  'templates',
  'terms',
  'u',
  'user',
  'users',
  'workspace',
])
const CASCADE_PAGE_SIZE = BATCH_LIMITS.cascadeDelete

// validator for getMe — public projection excluding operator diagnostics &
// auth internals. _id is a plain string (contracts can't depend on Convex's
// branded Id<'users'>); brand is lost but only used as opaque identifier
const publicUserMeValidator = v.object({
  _id: v.string(),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  externalId: v.union(v.string(), v.null()),
  tier: v.union(v.literal('free'), v.literal('premium')),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  handle: v.union(v.string(), v.null()),
  bio: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  website: v.union(v.string(), v.null()),
  pronouns: v.union(v.string(), v.null()),
})

// return the caller's public profile, or null if unauthenticated.
// narrower than Doc<'users'> to keep internal bookkeeping off the wire
export const getMe = query({
  args: {},
  returns: v.union(publicUserMeValidator, v.null()),
  handler: async (ctx): Promise<PublicUserMe | null> =>
  {
    const user = await getCurrentUser(ctx)
    if (!user)
    {
      return null
    }
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      displayName: user.displayName ?? null,
      image: user.image ?? null,
      externalId: user.externalId ?? null,
      tier: user.tier ?? 'free',
      createdAt: user.createdAt ?? user._creationTime,
      updatedAt: user.updatedAt ?? null,
      handle: user.handle ?? null,
      bio: user.bio ?? null,
      location: user.location ?? null,
      website: user.website ?? null,
      pronouns: user.pronouns ?? null,
    }
  },
})

// update any subset of the caller's profile fields. omit a field to leave
// it unchanged; pass empty string to clear (handle/bio/location/website/
// pronouns). displayName cannot be cleared. handle is normalized lowercase
// & checked for regex/reserved/uniqueness; failing any of those rejects the
// whole patch (so other fields don't get half-applied)
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    website: v.optional(v.string()),
    pronouns: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const patch: Partial<{
      displayName: string
      handle: string | undefined
      bio: string | undefined
      location: string | undefined
      website: string | undefined
      pronouns: string | undefined
      updatedAt: number
    }> = {}

    if (args.displayName !== undefined)
    {
      const trimmed = args.displayName.trim()
      if (trimmed.length === 0)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: 'display name cannot be empty',
        })
      }
      if (trimmed.length > MAX_DISPLAY_NAME_LEN)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `display name must be at most ${MAX_DISPLAY_NAME_LEN} characters`,
        })
      }
      patch.displayName = trimmed
    }

    if (args.bio !== undefined)
    {
      const trimmed = args.bio.trim()
      if (trimmed.length > MAX_BIO_LEN)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `bio must be at most ${MAX_BIO_LEN} characters`,
        })
      }
      patch.bio = trimmed.length === 0 ? undefined : trimmed
    }

    if (args.location !== undefined)
    {
      const trimmed = args.location.trim()
      if (trimmed.length > MAX_LOCATION_LEN)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `location must be at most ${MAX_LOCATION_LEN} characters`,
        })
      }
      patch.location = trimmed.length === 0 ? undefined : trimmed
    }

    if (args.website !== undefined)
    {
      const trimmed = args.website.trim()
      if (trimmed.length > MAX_WEBSITE_LEN)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `website must be at most ${MAX_WEBSITE_LEN} characters`,
        })
      }
      if (trimmed.length > 0)
      {
        // accept bare domains too — many users will type "example.com" w/o
        // the scheme. we prepend https:// before parsing & save the original
        const candidate = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`
        try
        {
          const url = new URL(candidate)
          if (url.protocol !== 'http:' && url.protocol !== 'https:')
          {
            throw new Error('non-http protocol')
          }
        }
        catch
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: 'website must be a valid http(s) URL',
          })
        }
      }
      patch.website = trimmed.length === 0 ? undefined : trimmed
    }

    if (args.pronouns !== undefined)
    {
      const trimmed = args.pronouns.trim()
      if (trimmed.length > MAX_PRONOUNS_LEN)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `pronouns must be at most ${MAX_PRONOUNS_LEN} characters`,
        })
      }
      patch.pronouns = trimmed.length === 0 ? undefined : trimmed
    }

    if (args.handle !== undefined)
    {
      const normalized = args.handle.trim().toLowerCase()
      if (normalized.length === 0)
      {
        patch.handle = undefined
      }
      else
      {
        if (
          normalized.length < MIN_HANDLE_LEN ||
          normalized.length > MAX_HANDLE_LEN
        )
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: `handle must be ${MIN_HANDLE_LEN}-${MAX_HANDLE_LEN} characters`,
          })
        }
        if (!HANDLE_REGEX.test(normalized))
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message:
              'handle must use lowercase letters, digits, _ or -; cannot start or end with - or _',
          })
        }
        if (RESERVED_HANDLES.has(normalized))
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: 'that handle is reserved',
          })
        }
        const existing = await ctx.db
          .query('users')
          .withIndex('byHandle', (q) => q.eq('handle', normalized))
          .first()
        if (existing && existing._id !== userId)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: 'that handle is taken',
          })
        }
        patch.handle = normalized
      }
    }

    if (Object.keys(patch).length === 0)
    {
      return null
    }
    patch.updatedAt = Date.now()
    await ctx.db.patch(userId, patch)
    return null
  },
})

// delete every authSession for the caller (and their refresh tokens).
// the current session is among them, so the next request from any client
// will get rejected — including the one that just ran this mutation
export const signOutEverywhere = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await deleteUserSessionsAndTokens(ctx, userId)
    return null
  },
})

// nuke the caller's account. inline: drop auth records so the user is locked
// out immediately. then schedule the (potentially heavy) data cascade in a
// background mutation that paginates through each owned table
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)

    // lock the user out across every device first. authAccounts go too — w/o
    // them the password provider can't re-establish a session for the same email
    await deleteUserSessionsAndTokens(ctx, userId)
    await deleteUserAccountsAndCodes(ctx, userId)

    // hand off to the phased cascade — boards/templates/etc. may exceed a
    // single mutation's write budget, so each phase reschedules itself
    await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
      userId,
      phase: 'boards',
      cursor: null,
    })
    return null
  },
})

// phased background cascade for owned data. each phase paginates one
// table; on isDone it transitions to the next phase w/ a fresh cursor.
// finalize phase deletes the user record itself
type CascadePhase =
  | 'boards'
  | 'templates'
  | 'tierPresets'
  | 'shortLinks'
  | 'mediaAssets'
  | 'userSettings'
  | 'finalize'

const NEXT_PHASE: Record<CascadePhase, CascadePhase | null> = {
  boards: 'templates',
  templates: 'tierPresets',
  tierPresets: 'shortLinks',
  shortLinks: 'mediaAssets',
  mediaAssets: 'userSettings',
  userSettings: 'finalize',
  finalize: null,
}

export const cascadeDeleteUserData = internalMutation({
  args: {
    userId: v.id('users'),
    phase: v.union(
      v.literal('boards'),
      v.literal('templates'),
      v.literal('tierPresets'),
      v.literal('shortLinks'),
      v.literal('mediaAssets'),
      v.literal('userSettings'),
      v.literal('finalize')
    ),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const { userId, phase, cursor } = args

    if (phase === 'boards')
    {
      // schedule cascadeDeleteBoard for each owned board (active or soft-deleted)
      const page = await ctx.db
        .query('boards')
        .withIndex('byOwnerDeletedUpdatedAt', (q) => q.eq('ownerId', userId))
        .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
      await Promise.all(
        page.page.map((board) =>
          ctx.scheduler.runAfter(
            0,
            internal.workspace.boards.internal.cascadeDeleteBoard,
            { boardId: board._id }
          )
        )
      )
      return await advanceCascade(ctx, userId, page, 'boards')
    }

    if (phase === 'templates')
    {
      const page = await ctx.db
        .query('templates')
        .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', userId))
        .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })

      // accumulate per-category deltas for marketplaceStats — only public,
      // currently-published rows count toward the displayed totals
      const deltasByCategory = new Map<string, number>()
      for (const template of page.page)
      {
        if (
          template.visibility === 'public' &&
          template.unpublishedAt === null
        )
        {
          deltasByCategory.set(
            template.category,
            (deltasByCategory.get(template.category) ?? 0) - 1
          )
        }

        // cascade the template's own children (items + tag rows) before the
        // template row itself
        const items = await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .collect()
        await Promise.all(items.map((item) => ctx.db.delete(item._id)))

        const tagRows = await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .collect()
        await Promise.all(tagRows.map((row) => ctx.db.delete(row._id)))

        await ctx.db.delete(template._id)
      }

      if (deltasByCategory.size > 0)
      {
        // category strings came directly from template rows whose validator
        // is templateCategoryValidator — safe to round-trip through the map
        await adjustPublicTemplateCount(
          ctx,
          [...deltasByCategory.entries()].map(([category, delta]) => ({
            category: category as PublicCategoryDelta['category'],
            delta,
          }))
        )
      }

      return await advanceCascade(ctx, userId, page, 'templates')
    }

    if (phase === 'tierPresets')
    {
      const page = await ctx.db
        .query('tierPresets')
        .withIndex('byOwner', (q) => q.eq('ownerId', userId))
        .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
      await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
      return await advanceCascade(ctx, userId, page, 'tierPresets')
    }

    if (phase === 'shortLinks')
    {
      const page = await ctx.db
        .query('shortLinks')
        .withIndex('byOwnerAndExpiresAt', (q) => q.eq('ownerId', userId))
        .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
      // snapshot blobs orphaned in _storage; the existing storage GC cron
      // sweeps them. cheaper than O(n) inline storage.delete calls
      await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
      return await advanceCascade(ctx, userId, page, 'shortLinks')
    }

    if (phase === 'mediaAssets')
    {
      const page = await ctx.db
        .query('mediaAssets')
        .withIndex('byOwnerAndExternalId', (q) => q.eq('ownerId', userId))
        .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
      // same logic — daily gcOrphanedMediaAssets handles the storage blobs
      await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
      return await advanceCascade(ctx, userId, page, 'mediaAssets')
    }

    if (phase === 'userSettings')
    {
      const settings = await ctx.db
        .query('userSettings')
        .withIndex('byUser', (q) => q.eq('userId', userId))
        .unique()
      if (settings)
      {
        await ctx.db.delete(settings._id)
      }
      await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
        userId,
        phase: 'finalize',
        cursor: null,
      })
      return null
    }

    // finalize — delete the user row. avatar storage blob (if any) is left
    // for the storage GC cron to reap, same as media assets above
    const user = await ctx.db.get(userId)
    if (user)
    {
      await ctx.db.delete(userId)
    }
    return null
  },
})

// rotate to the next page of the same phase, or transition to the next phase
// once isDone. phaseOrder is fixed; finalize handles its own scheduling above
const advanceCascade = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  page: { isDone: boolean; continueCursor: string },
  currentPhase: CascadePhase
): Promise<null> =>
{
  if (!page.isDone)
  {
    await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
      userId,
      phase: currentPhase,
      cursor: page.continueCursor,
    })
    return null
  }

  const next = NEXT_PHASE[currentPhase]
  if (next === null)
  {
    return null
  }
  await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
    userId,
    phase: next,
    cursor: null,
  })
  return null
}

// auth lib helpers ---

// drop every authSession for a user. for each session, sweep its refresh
// tokens too. authVerifiers are short-lived OAuth/PKCE state w/ no userId
// link so we let them expire naturally
const deleteUserSessionsAndTokens = async (
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> =>
{
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .collect()
  for (const session of sessions)
  {
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .collect()
    await Promise.all(tokens.map((t) => ctx.db.delete(t._id)))
    await ctx.db.delete(session._id)
  }
}

// drop every authAccount for a user (per-provider login link), plus any
// outstanding verification codes. without this the same email could re-claim
// the user record on next sign-in
const deleteUserAccountsAndCodes = async (
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> =>
{
  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
    .collect()
  for (const account of accounts)
  {
    const codes = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', account._id))
      .collect()
    await Promise.all(codes.map((c) => ctx.db.delete(c._id)))
    await ctx.db.delete(account._id)
  }
}
