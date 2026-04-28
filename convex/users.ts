// convex/users.ts
// user query & account-management mutations

import { getAuthSessionId } from '@convex-dev/auth/server'
import { v, type Infer } from 'convex/values'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id, TableNames } from './_generated/dataModel'
import {
  HANDLE_REGEX,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  MIN_HANDLE_LENGTH,
  PRONOUN_OPTION_SET,
  RESERVED_HANDLES,
  type PublicUserMe,
} from '@tierlistbuilder/contracts/platform/user'
import { getCurrentUser, requireCurrentUserId } from './lib/auth'
import { BATCH_LIMITS } from './lib/limits'
import {
  failInput,
  normalizeNullableText,
  normalizeRequiredText,
} from './lib/text'
import {
  adjustPublicTemplateCount,
  deleteTemplateParentRow,
  isPublicTemplateRow,
  type PublicCategoryDelta,
} from './marketplace/templates/lib'

const RESERVED_HANDLE_SET = new Set<string>(RESERVED_HANDLES)
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
  pronouns: v.union(v.string(), v.null()),
})

// drift guard: PublicUserMe (TS contract) & the runtime validator above must
// stay structurally identical. adding a field to one without the other flips
// this to `false`, failing compilation
type _PublicUserMeMatchesValidator =
  PublicUserMe extends Infer<typeof publicUserMeValidator>
    ? Infer<typeof publicUserMeValidator> extends PublicUserMe
      ? true
      : false
    : false
const _publicUserMeContractCheck: _PublicUserMeMatchesValidator = true
void _publicUserMeContractCheck

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
      pronouns: user.pronouns ?? null,
    }
  },
})

// patch caller profile fields. omit a field to keep it; '' clears nullable
// fields. handle is lowercased, reserved/unique-checked, & rejects atomically
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
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
      pronouns: string | undefined
      updatedAt: number
    }> = {}

    if (args.displayName !== undefined)
    {
      patch.displayName = normalizeRequiredText(
        args.displayName,
        MAX_DISPLAY_NAME_LENGTH,
        'display name'
      )
    }

    if (args.bio !== undefined)
    {
      patch.bio =
        normalizeNullableText(args.bio, MAX_BIO_LENGTH, 'bio') ?? undefined
    }

    if (args.location !== undefined)
    {
      patch.location =
        normalizeNullableText(args.location, MAX_LOCATION_LENGTH, 'location') ??
        undefined
    }

    if (args.pronouns !== undefined)
    {
      const trimmed = args.pronouns.trim()
      if (trimmed.length === 0)
      {
        patch.pronouns = undefined
      }
      else
      {
        if (!PRONOUN_OPTION_SET.has(trimmed))
        {
          failInput('pronouns must be one of the supported options')
        }
        patch.pronouns = trimmed
      }
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
          normalized.length < MIN_HANDLE_LENGTH ||
          normalized.length > MAX_HANDLE_LENGTH
        )
        {
          failInput(
            `handle must be ${MIN_HANDLE_LENGTH}-${MAX_HANDLE_LENGTH} characters`
          )
        }
        if (!HANDLE_REGEX.test(normalized))
        {
          failInput(
            'handle must use lowercase letters, digits, _ or -; cannot start or end with - or _'
          )
        }
        if (RESERVED_HANDLE_SET.has(normalized))
        {
          failInput('that handle is reserved')
        }
        const existing = await ctx.db
          .query('users')
          .withIndex('byHandle', (q) => q.eq('handle', normalized))
          .first()
        if (existing && existing._id !== userId)
        {
          failInput('that handle is taken')
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

// revoke caller auth sessions before returning
export const signOutEverywhere = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await drainAuthSessionCleanup(
      ctx,
      userId,
      await getInitialAuthSessionState(ctx)
    )
    return null
  },
})

// delete caller account data through bounded auth & owned-data phases
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const sessionState = await getInitialAuthSessionState(ctx)

    await drainAuthSessionCleanup(ctx, userId, sessionState)
    await drainAuthAccountCleanup(ctx, userId, { cursor: null })
    await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
      userId,
      phase: 'boards',
      cursor: null,
    })
    return null
  },
})

const cascadePhaseValidator = v.union(
  v.literal('authSessions'),
  v.literal('authAccounts'),
  v.literal('boards'),
  v.literal('templates'),
  v.literal('tierPresets'),
  v.literal('shortLinks'),
  v.literal('mediaAssets'),
  v.literal('userSettings')
)
type CascadePhase = Infer<typeof cascadePhaseValidator>

const NEXT_PHASE: Record<CascadePhase, CascadePhase | null> = {
  authSessions: 'authAccounts',
  authAccounts: 'boards',
  boards: 'templates',
  templates: 'tierPresets',
  tierPresets: 'shortLinks',
  shortLinks: 'mediaAssets',
  mediaAssets: 'userSettings',
  userSettings: null,
}

interface AuthSessionCleanupState
{
  cursor: string | null
  targetSessionId?: Id<'authSessions'>
  tokenCursor?: string | null
}

interface AuthAccountCleanupState
{
  cursor: string | null
  targetAccountId?: Id<'authAccounts'>
  codeCursor?: string | null
}

type CleanupStep<TState> = { isDone: true } | ({ isDone: false } & TState)

interface CascadeMutationArgs
{
  userId: Id<'users'>
  phase: CascadePhase
  cursor: string | null
  targetSessionId?: Id<'authSessions'>
  tokenCursor?: string | null
  targetAccountId?: Id<'authAccounts'>
  codeCursor?: string | null
}

type CascadePhaseHandler = (
  ctx: MutationCtx,
  args: CascadeMutationArgs
) => Promise<null>

export const cleanupAuthSessions = internalMutation({
  args: {
    userId: v.id('users'),
    cursor: v.union(v.string(), v.null()),
    targetSessionId: v.optional(v.id('authSessions')),
    tokenCursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const result = await deleteAuthSessionCleanupStep(ctx, args.userId, {
      cursor: args.cursor,
      targetSessionId: args.targetSessionId,
      tokenCursor: args.tokenCursor,
    })
    if (!result.isDone)
    {
      await scheduleAuthSessionCleanup(ctx, args.userId, result)
    }
    return null
  },
})

const CASCADE_PHASE_HANDLERS: Record<CascadePhase, CascadePhaseHandler> = {
  authSessions: async (ctx, args) => await handleAuthSessionsPhase(ctx, args),
  authAccounts: async (ctx, args) => await handleAuthAccountsPhase(ctx, args),
  boards: async (ctx, args) => await handleBoardsPhase(ctx, args),
  templates: async (ctx, args) => await handleTemplatesPhase(ctx, args),
  tierPresets: async (ctx, args) => await handleTierPresetsPhase(ctx, args),
  shortLinks: async (ctx, args) => await handleShortLinksPhase(ctx, args),
  mediaAssets: async (ctx, args) => await handleMediaAssetsPhase(ctx, args),
  userSettings: async (ctx, args) => await handleUserSettingsPhase(ctx, args),
}

export const cascadeDeleteUserData = internalMutation({
  args: {
    userId: v.id('users'),
    phase: cascadePhaseValidator,
    cursor: v.union(v.string(), v.null()),
    targetSessionId: v.optional(v.id('authSessions')),
    tokenCursor: v.optional(v.union(v.string(), v.null())),
    targetAccountId: v.optional(v.id('authAccounts')),
    codeCursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    return await CASCADE_PHASE_HANDLERS[args.phase](ctx, args)
  },
})

const handleAuthSessionsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const result = await deleteAuthSessionCleanupStep(ctx, args.userId, {
    cursor: args.cursor,
    targetSessionId: args.targetSessionId,
    tokenCursor: args.tokenCursor,
  })
  if (!result.isDone)
  {
    await scheduleCascadeAuthSessions(ctx, args.userId, result)
    return null
  }
  return await advanceCascadePhase(ctx, args.userId, 'authSessions')
}

const handleAuthAccountsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const result = await deleteAuthAccountCleanupStep(ctx, args.userId, {
    cursor: args.cursor,
    targetAccountId: args.targetAccountId,
    codeCursor: args.codeCursor,
  })
  if (!result.isDone)
  {
    await scheduleCascadeAuthAccounts(ctx, args.userId, result)
    return null
  }
  return await advanceCascadePhase(ctx, args.userId, 'authAccounts')
}

const handleBoardsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('boards')
    .withIndex('byOwnerDeletedUpdatedAt', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  await Promise.all(
    page.page.map((board) =>
      ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        { boardId: board._id }
      )
    )
  )
  return await advanceCascade(ctx, args.userId, page, 'boards')
}

const handleTemplatesPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('templates')
    .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })

  const deltasByCategory = new Map<string, number>()
  for (const template of page.page)
  {
    if (isPublicTemplateRow(template))
    {
      deltasByCategory.set(
        template.category,
        (deltasByCategory.get(template.category) ?? 0) - 1
      )
    }
  }

  if (deltasByCategory.size > 0)
  {
    await adjustPublicTemplateCount(
      ctx,
      [...deltasByCategory.entries()].map(([category, delta]) => ({
        category: category as PublicCategoryDelta['category'],
        delta,
      }))
    )
  }

  await Promise.all(
    page.page.map((template) => deleteTemplateParentRow(ctx, template))
  )

  await Promise.all(
    page.page.map((template) =>
      ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        { templateId: template._id }
      )
    )
  )
  return await advanceCascade(ctx, args.userId, page, 'templates')
}

const handleTierPresetsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('tierPresets')
    .withIndex('byOwner', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  return await deletePageRowsAndAdvance(ctx, args.userId, page, 'tierPresets')
}

const handleShortLinksPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('shortLinks')
    .withIndex('byOwnerAndExpiresAt', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  return await deletePageRowsAndAdvance(ctx, args.userId, page, 'shortLinks')
}

const handleMediaAssetsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndExternalId', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  return await deletePageRowsAndAdvance(ctx, args.userId, page, 'mediaAssets')
}

const handleUserSettingsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const settings = await ctx.db
    .query('userSettings')
    .withIndex('byUser', (q) => q.eq('userId', args.userId))
    .unique()
  if (settings)
  {
    await ctx.db.delete(settings._id)
  }

  const user = await ctx.db.get(args.userId)
  if (user)
  {
    await ctx.db.delete(args.userId)
  }
  return null
}

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

  return await advanceCascadePhase(ctx, userId, currentPhase)
}

const advanceCascadePhase = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  currentPhase: CascadePhase
): Promise<null> =>
{
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

const deletePageRowsAndAdvance = async <TableName extends TableNames>(
  ctx: MutationCtx,
  userId: Id<'users'>,
  page: {
    page: Array<{ _id: Id<TableName> }>
    isDone: boolean
    continueCursor: string
  },
  currentPhase: CascadePhase
): Promise<null> =>
{
  await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
  return await advanceCascade(ctx, userId, page, currentPhase)
}

const getInitialAuthSessionState = async (
  ctx: MutationCtx
): Promise<AuthSessionCleanupState> =>
{
  const targetSessionId = await getAuthSessionId(ctx)
  return targetSessionId
    ? { cursor: null, targetSessionId, tokenCursor: null }
    : { cursor: null }
}

const drainAuthSessionCleanup = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState
): Promise<void> =>
{
  let result = await deleteAuthSessionCleanupStep(ctx, userId, state)
  while (!result.isDone)
  {
    result = await deleteAuthSessionCleanupStep(ctx, userId, result)
  }
}

const drainAuthAccountCleanup = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthAccountCleanupState
): Promise<void> =>
{
  let result = await deleteAuthAccountCleanupStep(ctx, userId, state)
  while (!result.isDone)
  {
    result = await deleteAuthAccountCleanupStep(ctx, userId, result)
  }
}

const scheduleAuthSessionCleanup = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState
): Promise<void> =>
{
  const args: {
    userId: Id<'users'>
    cursor: string | null
    targetSessionId?: Id<'authSessions'>
    tokenCursor?: string | null
  } = {
    userId,
    cursor: state.cursor,
  }
  if (state.targetSessionId !== undefined)
  {
    args.targetSessionId = state.targetSessionId
  }
  if (state.tokenCursor !== undefined)
  {
    args.tokenCursor = state.tokenCursor
  }
  await ctx.scheduler.runAfter(0, internal.users.cleanupAuthSessions, args)
}

const scheduleCascadeAuthSessions = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState
): Promise<void> =>
{
  const args: {
    userId: Id<'users'>
    phase: 'authSessions'
    cursor: string | null
    targetSessionId?: Id<'authSessions'>
    tokenCursor?: string | null
  } = {
    userId,
    phase: 'authSessions',
    cursor: state.cursor,
  }
  if (state.targetSessionId !== undefined)
  {
    args.targetSessionId = state.targetSessionId
  }
  if (state.tokenCursor !== undefined)
  {
    args.tokenCursor = state.tokenCursor
  }
  await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, args)
}

const scheduleCascadeAuthAccounts = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthAccountCleanupState
): Promise<void> =>
{
  const args: {
    userId: Id<'users'>
    phase: 'authAccounts'
    cursor: string | null
    targetAccountId?: Id<'authAccounts'>
    codeCursor?: string | null
  } = {
    userId,
    phase: 'authAccounts',
    cursor: state.cursor,
  }
  if (state.targetAccountId !== undefined)
  {
    args.targetAccountId = state.targetAccountId
  }
  if (state.codeCursor !== undefined)
  {
    args.codeCursor = state.codeCursor
  }
  await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, args)
}

const deleteAuthSessionCleanupStep = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState
): Promise<CleanupStep<AuthSessionCleanupState>> =>
{
  let session = state.targetSessionId
    ? await ctx.db.get(state.targetSessionId)
    : null
  let cursor = state.cursor
  let hasMoreSessions = state.targetSessionId !== undefined

  if (session && session.userId !== userId)
  {
    return { isDone: false, cursor }
  }

  const targetSessionId = state.targetSessionId
  if (!session && targetSessionId)
  {
    const tokenPage = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', targetSessionId))
      .paginate({
        numItems: CASCADE_PAGE_SIZE,
        cursor: state.tokenCursor ?? null,
      })
    await Promise.all(tokenPage.page.map((token) => ctx.db.delete(token._id)))

    if (!tokenPage.isDone)
    {
      return {
        isDone: false,
        cursor,
        targetSessionId,
        tokenCursor: tokenPage.continueCursor,
      }
    }
    return { isDone: false, cursor }
  }

  if (!session)
  {
    const page = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: 1, cursor })
    if (page.page.length === 0)
    {
      return { isDone: true }
    }
    session = page.page[0]
    cursor = page.continueCursor
    hasMoreSessions = !page.isDone
  }

  const tokenPage = await ctx.db
    .query('authRefreshTokens')
    .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
    .paginate({
      numItems: CASCADE_PAGE_SIZE,
      cursor: state.tokenCursor ?? null,
    })
  await Promise.all(tokenPage.page.map((token) => ctx.db.delete(token._id)))

  if (!tokenPage.isDone)
  {
    return {
      isDone: false,
      cursor,
      targetSessionId: session._id,
      tokenCursor: tokenPage.continueCursor,
    }
  }

  await ctx.db.delete(session._id)
  return hasMoreSessions ? { isDone: false, cursor } : { isDone: true }
}

const deleteAuthAccountCleanupStep = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthAccountCleanupState
): Promise<CleanupStep<AuthAccountCleanupState>> =>
{
  let account = state.targetAccountId
    ? await ctx.db.get(state.targetAccountId)
    : null
  let cursor = state.cursor
  let hasMoreAccounts = state.targetAccountId !== undefined

  if (account && account.userId !== userId)
  {
    return { isDone: false, cursor }
  }

  const targetAccountId = state.targetAccountId
  if (!account && targetAccountId)
  {
    const codePage = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', targetAccountId))
      .paginate({
        numItems: CASCADE_PAGE_SIZE,
        cursor: state.codeCursor ?? null,
      })
    await Promise.all(codePage.page.map((code) => ctx.db.delete(code._id)))

    if (!codePage.isDone)
    {
      return {
        isDone: false,
        cursor,
        targetAccountId,
        codeCursor: codePage.continueCursor,
      }
    }
    return { isDone: false, cursor }
  }

  if (!account)
  {
    const page = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .paginate({ numItems: 1, cursor })
    if (page.page.length === 0)
    {
      return { isDone: true }
    }
    account = page.page[0]
    cursor = page.continueCursor
    hasMoreAccounts = !page.isDone
  }

  const codePage = await ctx.db
    .query('authVerificationCodes')
    .withIndex('accountId', (q) => q.eq('accountId', account._id))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: state.codeCursor ?? null })
  await Promise.all(codePage.page.map((code) => ctx.db.delete(code._id)))

  if (!codePage.isDone)
  {
    return {
      isDone: false,
      cursor,
      targetAccountId: account._id,
      codeCursor: codePage.continueCursor,
    }
  }

  await ctx.db.delete(account._id)
  return hasMoreAccounts ? { isDone: false, cursor } : { isDone: true }
}
