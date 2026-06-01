// convex/platform/account/cascadeDelete.ts
// account deletion cascade

import { getAuthSessionId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from '../../_generated/server'
import type { Doc, Id, TableNames } from '../../_generated/dataModel'
import { requireCurrentUserId } from '../../lib/auth'
import { BATCH_LIMITS } from '../../lib/limits'
import { literalUnion } from '../../lib/validators/common'
import {
  adjustPublicTemplateCount,
  deleteTemplateParentRow,
  type PublicCategoryDelta,
} from '../../marketplace/templates/lib/writes'
import { isPublicTemplateRow } from '../../marketplace/templates/lib/state'
import { queueTemplateRankingAggregateRecomputesForRankings } from '../../marketplace/rankings/aggregate/lib'
import {
  deleteMediaAssetWithVariants,
  hasMediaAssetReferences,
} from '../media/internal'
import { deleteShowcaseWithChildren } from '../../social/showcase/internal'

const CASCADE_PAGE_SIZE = BATCH_LIMITS.cascadeDelete

// Schedule caller account deletion through bounded auth + owned-data phases.
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await scheduleAuthSessionCleanup(
      ctx,
      userId,
      await getInitialAuthSessionState(ctx),
      'startCascade'
    )
    return null
  },
})

// authSessions is absent; cleanupAuthSessions enters that phase first.
// mode='startCascade' then jumps here at authAccounts.
const CASCADE_PHASES = [
  'authAccounts',
  'boards',
  'templates',
  'rankings',
  'profileShowcases',
  'bookmarks',
  'tierPresets',
  'shortLinks',
  'mediaAssets',
  'userPreferences',
] as const

const cascadePhaseValidator = literalUnion(CASCADE_PHASES)
type CascadePhase = (typeof CASCADE_PHASES)[number]

const AUTH_SESSION_CLEANUP_MODES = ['signOutOnly', 'startCascade'] as const
const authSessionCleanupModeValidator = literalUnion(AUTH_SESSION_CLEANUP_MODES)
export type AuthSessionCleanupMode = (typeof AUTH_SESSION_CLEANUP_MODES)[number]
type SchedulerCtx = Pick<MutationCtx, 'scheduler'>

// Drain revoked session refresh tokens in bounded pages.
// revokeSession already deleted the parent session row.
export const cleanupRevokedSessionTokens = internalMutation({
  args: {
    sessionId: v.id('authSessions'),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const tokenPage = await deleteOwnedAuthChildPage(
      ctx,
      args.sessionId,
      args.cursor,
      AUTH_SESSION_CASCADE_CONFIG
    )
    if (!tokenPage.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.users.cleanupRevokedSessionTokens,
        { sessionId: args.sessionId, cursor: tokenPage.continueCursor }
      )
    }
    return null
  },
})

const nextCascadePhase = (currentPhase: CascadePhase): CascadePhase | null =>
{
  const index = CASCADE_PHASES.indexOf(currentPhase)
  return CASCADE_PHASES[index + 1] ?? null
}

export interface AuthSessionCleanupState
{
  cursor: string | null
  targetSessionId?: Id<'authSessions'>
  tokenCursor?: string | null
  exceptSessionId?: Id<'authSessions'>
}

interface AuthAccountCleanupState
{
  cursor: string | null
  targetAccountId?: Id<'authAccounts'>
  codeCursor?: string | null
}

type CleanupStep<TState> = { isDone: true } | ({ isDone: false } & TState)
type StripUndefined<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >
}

const stripUndefined = <T extends Record<string, unknown>>(
  value: T
): StripUndefined<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as StripUndefined<T>

type OwnedAuthParentTable = 'authSessions' | 'authAccounts'

interface OwnedAuthParentCascadeState<
  TParentTable extends OwnedAuthParentTable,
>
{
  cursor: string | null
  targetParentId?: Id<TParentTable>
  childCursor?: string | null
  excludedParentId?: Id<TParentTable>
}

type AuthSessionCascadeConfig = {
  parentTable: 'authSessions'
  parentIndex: 'userId'
  childTable: 'authRefreshTokens'
  childIndex: 'sessionId'
  childForeignKey: 'sessionId'
}

type AuthAccountCascadeConfig = {
  parentTable: 'authAccounts'
  parentIndex: 'userIdAndProvider'
  childTable: 'authVerificationCodes'
  childIndex: 'accountId'
  childForeignKey: 'accountId'
}

type OwnedAuthParentCascadeConfig =
  | AuthSessionCascadeConfig
  | AuthAccountCascadeConfig

type OwnedAuthParentId = Id<'authSessions'> | Id<'authAccounts'>

type OwnedAuthParentPage = {
  page: Array<{ _id: OwnedAuthParentId }>
  isDone: boolean
  continueCursor: string
}

type OwnedAuthChildPage = {
  isDone: boolean
  continueCursor: string
}

const AUTH_SESSION_CASCADE_CONFIG = {
  parentTable: 'authSessions',
  parentIndex: 'userId',
  childTable: 'authRefreshTokens',
  childIndex: 'sessionId',
  childForeignKey: 'sessionId',
} as const satisfies AuthSessionCascadeConfig

const AUTH_ACCOUNT_CASCADE_CONFIG = {
  parentTable: 'authAccounts',
  parentIndex: 'userIdAndProvider',
  childTable: 'authVerificationCodes',
  childIndex: 'accountId',
  childForeignKey: 'accountId',
} as const satisfies AuthAccountCascadeConfig

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
    mode: authSessionCleanupModeValidator,
    cursor: v.union(v.string(), v.null()),
    targetSessionId: v.optional(v.id('authSessions')),
    tokenCursor: v.optional(v.union(v.string(), v.null())),
    exceptSessionId: v.optional(v.id('authSessions')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    return await runAuthSessionCleanup(ctx, args.userId, args, args.mode)
  },
})

const CASCADE_PHASE_HANDLERS: Record<CascadePhase, CascadePhaseHandler> = {
  authAccounts: async (ctx, args) => await handleAuthAccountsPhase(ctx, args),
  boards: async (ctx, args) => await handleBoardsPhase(ctx, args),
  templates: async (ctx, args) => await handleTemplatesPhase(ctx, args),
  rankings: async (ctx, args) => await handleRankingsPhase(ctx, args),
  profileShowcases: async (ctx, args) =>
    await handleProfileShowcasesPhase(ctx, args),
  bookmarks: async (ctx, args) => await handleBookmarksPhase(ctx, args),
  tierPresets: async (ctx, args) => await handleTierPresetsPhase(ctx, args),
  shortLinks: async (ctx, args) => await handleShortLinksPhase(ctx, args),
  mediaAssets: async (ctx, args) => await handleMediaAssetsPhase(ctx, args),
  userPreferences: async (ctx, args) =>
    await handleUserPreferencesPhase(ctx, args),
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

// Shared step for signOutEverywhere + deleteAccount cascade entry.
// Reschedules cleanupAuthSessions until mode-specific completion.
const runAuthSessionCleanup = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState,
  mode: AuthSessionCleanupMode
): Promise<null> =>
{
  const result = await deleteAuthSessionCleanupStep(ctx, userId, {
    cursor: state.cursor,
    targetSessionId: state.targetSessionId,
    tokenCursor: state.tokenCursor,
    exceptSessionId: state.exceptSessionId,
  })
  if (!result.isDone)
  {
    await scheduleAuthSessionCleanup(ctx, userId, result, mode)
    return null
  }
  if (mode === 'startCascade')
  {
    await ctx.scheduler.runAfter(0, internal.users.cascadeDeleteUserData, {
      userId,
      phase: CASCADE_PHASES[0],
      cursor: null,
    })
  }
  return null
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

const handleRankingsPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('publishedRankings')
    .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })

  const now = Date.now()
  await queueTemplateRankingAggregateRecomputesForRankings(
    ctx,
    page.page.filter((ranking) => ranking.isPubliclyListable),
    now
  )

  await Promise.all(
    page.page.flatMap((ranking) => [
      ctx.db.delete(ranking._id),
      ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.maintenance.cascade.cascadeDeleteRanking,
        { rankingId: ranking._id }
      ),
    ])
  )
  return await advanceCascade(ctx, args.userId, page, 'rankings')
}

const handleProfileShowcasesPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('profileShowcases')
    .withIndex('byOwner', (q) => q.eq('ownerId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  await Promise.all(
    page.page.map((row) => deleteShowcaseWithChildren(ctx, row._id))
  )
  return await advanceCascade(ctx, args.userId, page, 'profileShowcases')
}

const handleBookmarksPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('userTemplateBookmarks')
    .withIndex('byUserCreatedAt', (q) => q.eq('userId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })
  return await deletePageRowsAndAdvance(ctx, args.userId, page, 'bookmarks')
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
  await Promise.all(
    page.page.map((asset) => deleteUnreachableMediaAsset(ctx, asset._id))
  )
  return await advanceCascade(ctx, args.userId, page, 'mediaAssets')
}

const deleteUnreachableMediaAsset = async (
  ctx: MutationCtx,
  mediaAssetId: Id<'mediaAssets'>
): Promise<void> =>
{
  if (await hasMediaAssetReferences(ctx, mediaAssetId)) return
  await deleteMediaAssetWithVariants(ctx, mediaAssetId)
}

const handleUserPreferencesPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const preferences = await ctx.db
    .query('userPreferences')
    .withIndex('byUser', (q) => q.eq('userId', args.userId))
    .unique()
  if (preferences)
  {
    await ctx.db.delete(preferences._id)
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
  const next = nextCascadePhase(currentPhase)
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

export const getInitialAuthSessionState = async (
  ctx: MutationCtx
): Promise<AuthSessionCleanupState> =>
{
  const targetSessionId = await getAuthSessionId(ctx)
  return targetSessionId
    ? { cursor: null, targetSessionId, tokenCursor: null }
    : { cursor: null }
}

export const scheduleAuthSessionCleanup = async (
  ctx: SchedulerCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState,
  mode: AuthSessionCleanupMode
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.users.cleanupAuthSessions,
    stripUndefined({
      userId,
      mode,
      cursor: state.cursor,
      targetSessionId: state.targetSessionId,
      tokenCursor: state.tokenCursor,
      exceptSessionId: state.exceptSessionId,
    })
  )
}

const scheduleCascadeAuthAccounts = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthAccountCleanupState
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.users.cascadeDeleteUserData,
    stripUndefined({
      userId,
      phase: 'authAccounts' as const,
      cursor: state.cursor,
      targetAccountId: state.targetAccountId,
      codeCursor: state.codeCursor,
    })
  )
}

const paginateOwnedAuthParentPage = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  cursor: string | null,
  config: OwnedAuthParentCascadeConfig
): Promise<OwnedAuthParentPage> =>
{
  if (config.parentTable === 'authSessions')
  {
    const page = await ctx.db
      .query('authSessions')
      .withIndex(config.parentIndex, (q) => q.eq('userId', userId))
      .paginate({ numItems: 1, cursor })
    return page
  }

  const page = await ctx.db
    .query('authAccounts')
    .withIndex(config.parentIndex, (q) => q.eq('userId', userId))
    .paginate({ numItems: 1, cursor })
  return page
}

const deleteOwnedAuthChildPage = async <
  TParentTable extends OwnedAuthParentTable,
>(
  ctx: MutationCtx,
  parentId: Id<TParentTable>,
  cursor: string | null,
  config: Extract<OwnedAuthParentCascadeConfig, { parentTable: TParentTable }>
): Promise<OwnedAuthChildPage> =>
{
  if (config.childTable === 'authRefreshTokens')
  {
    const page = await ctx.db
      .query(config.childTable)
      .withIndex(config.childIndex, (q) =>
        q.eq(config.childForeignKey, parentId as Id<'authSessions'>)
      )
      .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
    await Promise.all(page.page.map((token) => ctx.db.delete(token._id)))
    return page
  }

  const page = await ctx.db
    .query(config.childTable)
    .withIndex(config.childIndex, (q) =>
      q.eq(config.childForeignKey, parentId as Id<'authAccounts'>)
    )
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor })
  await Promise.all(page.page.map((code) => ctx.db.delete(code._id)))
  return page
}

const deleteOwnedParentCascadeStep = async <
  TParentTable extends OwnedAuthParentTable,
>(
  ctx: MutationCtx,
  userId: Id<'users'>,
  config: Extract<OwnedAuthParentCascadeConfig, { parentTable: TParentTable }>,
  state: OwnedAuthParentCascadeState<TParentTable>
): Promise<CleanupStep<OwnedAuthParentCascadeState<TParentTable>>> =>
{
  const parent = state.targetParentId
    ? ((await ctx.db.get(state.targetParentId)) as
        | (Doc<TParentTable> & { userId: Id<'users'> })
        | null)
    : null
  const cursor = state.cursor

  if (parent && parent.userId !== userId)
  {
    return { isDone: false, cursor }
  }

  if (parent && parent._id === state.excludedParentId)
  {
    return {
      isDone: false,
      cursor,
      excludedParentId: state.excludedParentId,
    }
  }

  const targetParentId = state.targetParentId
  if (!parent && targetParentId)
  {
    const childPage = await deleteOwnedAuthChildPage(
      ctx,
      targetParentId,
      state.childCursor ?? null,
      config
    )

    if (!childPage.isDone)
    {
      return {
        isDone: false,
        cursor,
        targetParentId,
        childCursor: childPage.continueCursor,
        excludedParentId: state.excludedParentId,
      }
    }
    return {
      isDone: false,
      cursor,
      excludedParentId: state.excludedParentId,
    }
  }

  if (!parent)
  {
    const page = await paginateOwnedAuthParentPage(ctx, userId, cursor, config)
    if (page.page.length === 0)
    {
      return { isDone: true }
    }
    if (page.page[0]._id === state.excludedParentId)
    {
      if (page.isDone)
      {
        return { isDone: true }
      }
      return {
        isDone: false,
        cursor: page.continueCursor,
        excludedParentId: state.excludedParentId,
      }
    }
    return {
      isDone: false,
      cursor: page.continueCursor,
      targetParentId: page.page[0]._id as Id<TParentTable>,
      excludedParentId: state.excludedParentId,
      childCursor: null,
    }
  }

  const childPage = await deleteOwnedAuthChildPage(
    ctx,
    parent._id,
    state.childCursor ?? null,
    config
  )
  if (!childPage.isDone)
  {
    return {
      isDone: false,
      cursor,
      targetParentId: parent._id,
      childCursor: childPage.continueCursor,
      excludedParentId: state.excludedParentId,
    }
  }

  await ctx.db.delete(parent._id)
  return {
    isDone: false,
    cursor,
    excludedParentId: state.excludedParentId,
  }
}

const deleteAuthSessionCleanupStep = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthSessionCleanupState
): Promise<CleanupStep<AuthSessionCleanupState>> =>
{
  const result = await deleteOwnedParentCascadeStep(
    ctx,
    userId,
    AUTH_SESSION_CASCADE_CONFIG,
    {
      cursor: state.cursor,
      targetParentId: state.targetSessionId,
      childCursor: state.tokenCursor,
      excludedParentId: state.exceptSessionId,
    }
  )

  if (result.isDone)
  {
    return result
  }
  return stripUndefined({
    isDone: false,
    cursor: result.cursor,
    targetSessionId: result.targetParentId,
    tokenCursor: result.childCursor,
    exceptSessionId: result.excludedParentId,
  }) as CleanupStep<AuthSessionCleanupState>
}

const deleteAuthAccountCleanupStep = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  state: AuthAccountCleanupState
): Promise<CleanupStep<AuthAccountCleanupState>> =>
{
  const result = await deleteOwnedParentCascadeStep(
    ctx,
    userId,
    AUTH_ACCOUNT_CASCADE_CONFIG,
    {
      cursor: state.cursor,
      targetParentId: state.targetAccountId,
      childCursor: state.codeCursor,
    }
  )

  if (result.isDone)
  {
    return result
  }
  return stripUndefined({
    isDone: false,
    cursor: result.cursor,
    targetAccountId: result.targetParentId,
    codeCursor: result.childCursor,
  }) as CleanupStep<AuthAccountCleanupState>
}
