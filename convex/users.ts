// convex/users.ts
// user query & account-management mutations

import {
  getAuthSessionId,
  modifyAccountCredentials,
  retrieveAccount,
} from '@convex-dev/auth/server'
import { ConvexError, v, type Infer } from 'convex/values'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import {
  DEFAULT_USER_PRIVACY_SETTINGS,
  HANDLE_REGEX,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_HANDLE_LENGTH,
  PRONOUN_OPTION_SET,
  type PublicUserSession,
  RESERVED_HANDLES,
  type PublicUserMe,
  type UserPrivacySettings,
} from '@tierlistbuilder/contracts/platform/user'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import { getCurrentUser, requireCurrentUserId } from './lib/auth'
import { BATCH_LIMITS } from './lib/limits'
import { literalUnion } from './lib/validators/common'
import {
  rankingVisibilityValidator,
  templateVisibilityValidator,
} from './lib/validators/marketplace'
import {
  failInput,
  normalizeNullableText,
  normalizeRequiredText,
} from './lib/text'
import {
  adjustPublicTemplateCount,
  deleteTemplateParentRow,
  type PublicCategoryDelta,
} from './marketplace/templates/lib/writes'
import { isPublicTemplateRow } from './marketplace/templates/lib/state'
import { queueTemplateRankingAggregateRecompute } from './marketplace/rankings/aggregate/lib'
import {
  deleteMediaAssetWithVariants,
  hasMediaAssetReferences,
} from './platform/media/internal'
import { parseUploadedImageMetadata } from './lib/imageValidation'
import { deleteStorageSilently, type StorageMetadata } from './lib/storage'
import {
  UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'

const RESERVED_HANDLE_SET = new Set<string>(RESERVED_HANDLES)
const CASCADE_PAGE_SIZE = BATCH_LIMITS.cascadeDelete
// upper bound on sessions shown in the account UI — generous vs the handful of
// devices a real user keeps, but bounded so the list query stays cheap
const SESSION_LIST_LIMIT = 50

const userPrivacySettingsValidator = v.object({
  defaultTemplateVisibility: templateVisibilityValidator,
  defaultRankingVisibility: rankingVisibilityValidator,
  showInMembersDirectory: v.boolean(),
  hideProfileFromSearch: v.boolean(),
  allowAiTraining: v.boolean(),
})

// validator for getMe — public projection excluding operator diagnostics &
// auth internals. _id is a plain string (contracts can't depend on Convex's
// branded Id<'users'>); brand is lost but only used as opaque identifier
const publicUserMeValidator = v.object({
  _id: v.string(),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  hasAvatar: v.boolean(),
  externalId: v.union(v.string(), v.null()),
  plan: v.union(v.literal('free'), v.literal('plus')),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  handle: v.union(v.string(), v.null()),
  bio: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  pronouns: v.union(v.string(), v.null()),
  privacy: userPrivacySettingsValidator,
})

const publicUserSessionValidator = v.object({
  _id: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  isCurrent: v.boolean(),
})

const revokeSessionResultValidator = v.object({
  revokedCurrent: v.boolean(),
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

type _PublicUserSessionMatchesValidator =
  PublicUserSession extends Infer<typeof publicUserSessionValidator>
    ? Infer<typeof publicUserSessionValidator> extends PublicUserSession
      ? true
      : false
    : false
const _publicUserSessionContractCheck: _PublicUserSessionMatchesValidator = true
void _publicUserSessionContractCheck

const resolveUserPrivacySettings = (
  user: Pick<
    Doc<'users'>,
    | 'defaultTemplateVisibility'
    | 'defaultRankingVisibility'
    | 'showInMembersDirectory'
    | 'hideProfileFromSearch'
    | 'allowAiTraining'
  >
): UserPrivacySettings => ({
  defaultTemplateVisibility:
    user.defaultTemplateVisibility ??
    DEFAULT_USER_PRIVACY_SETTINGS.defaultTemplateVisibility,
  defaultRankingVisibility:
    user.defaultRankingVisibility ??
    DEFAULT_USER_PRIVACY_SETTINGS.defaultRankingVisibility,
  showInMembersDirectory:
    user.showInMembersDirectory ??
    DEFAULT_USER_PRIVACY_SETTINGS.showInMembersDirectory,
  hideProfileFromSearch:
    user.hideProfileFromSearch ??
    DEFAULT_USER_PRIVACY_SETTINGS.hideProfileFromSearch,
  allowAiTraining:
    user.allowAiTraining ?? DEFAULT_USER_PRIVACY_SETTINGS.allowAiTraining,
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
    const avatarUrl = user.avatarStorageId
      ? await ctx.storage.getUrl(user.avatarStorageId)
      : null
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      displayName: user.displayName ?? null,
      image: avatarUrl ?? user.image ?? null,
      hasAvatar: user.avatarStorageId !== undefined,
      externalId: user.externalId ?? null,
      plan: user.plan ?? 'free',
      createdAt: user.createdAt ?? user._creationTime,
      updatedAt: user.updatedAt ?? null,
      handle: user.handle ?? null,
      bio: user.bio ?? null,
      location: user.location ?? null,
      pronouns: user.pronouns ?? null,
      privacy: resolveUserPrivacySettings(user),
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
    if (args.displayName !== undefined || args.handle !== undefined)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
        { authorId: userId, cursor: null }
      )
    }
    return null
  },
})

export const updatePrivacySettings = mutation({
  args: {
    defaultTemplateVisibility: v.optional(templateVisibilityValidator),
    defaultRankingVisibility: v.optional(rankingVisibilityValidator),
    showInMembersDirectory: v.optional(v.boolean()),
    hideProfileFromSearch: v.optional(v.boolean()),
    allowAiTraining: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const patch: Partial<UserPrivacySettings> & { updatedAt?: number } = {}

    if (args.defaultTemplateVisibility !== undefined)
    {
      patch.defaultTemplateVisibility = args.defaultTemplateVisibility
    }
    if (args.defaultRankingVisibility !== undefined)
    {
      patch.defaultRankingVisibility = args.defaultRankingVisibility
    }
    if (args.showInMembersDirectory !== undefined)
    {
      patch.showInMembersDirectory = args.showInMembersDirectory
    }
    if (args.hideProfileFromSearch !== undefined)
    {
      patch.hideProfileFromSearch = args.hideProfileFromSearch
    }
    if (args.allowAiTraining !== undefined)
    {
      patch.allowAiTraining = args.allowAiTraining
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

export const listSessions = query({
  args: {},
  returns: v.array(publicUserSessionValidator),
  handler: async (ctx): Promise<PublicUserSession[]> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const currentSessionId = await getAuthSessionId(ctx)
    const now = Date.now()
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .order('desc')
      .filter((q) => q.gt(q.field('expirationTime'), now))
      .take(SESSION_LIST_LIMIT)

    return sessions.map((session) => ({
      _id: session._id,
      createdAt: session._creationTime,
      expiresAt: session.expirationTime,
      isCurrent: session._id === currentSessionId,
    }))
  },
})

export const revokeSession = mutation({
  args: { sessionId: v.id('authSessions') },
  returns: revokeSessionResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<Infer<typeof revokeSessionResultValidator>> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId)
    {
      return { revokedCurrent: false }
    }
    const currentSessionId = await getAuthSessionId(ctx)
    // delete the session row inline so revocation takes effect immediately &
    // listSessions reflects it on the next tick; if the scheduled child sweep
    // were the only deletion, a failed/delayed job would leave it valid
    await ctx.db.delete(args.sessionId)
    await ctx.scheduler.runAfter(
      0,
      internal.users.cleanupRevokedSessionTokens,
      { sessionId: args.sessionId, cursor: null }
    )
    return { revokedCurrent: args.sessionId === currentSessionId }
  },
})

export const removeAvatar = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const user = await ctx.db.get(userId)
    if (!user || !user.avatarStorageId)
    {
      return null
    }
    await ctx.db.patch(userId, {
      avatarStorageId: undefined,
      updatedAt: Date.now(),
    })
    await scheduleAuthorCardSync(ctx, userId)
    return null
  },
})

export const setAvatar = action({
  args: {
    storageId: v.id('_storage'),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const cleanStorageId = await validateUploadedAvatar(ctx, userId, args)
    try
    {
      await ctx.runMutation(internal.users.commitAvatar, {
        userId,
        avatarStorageId: cleanStorageId,
      })
    }
    catch (error)
    {
      // commit is the only fallible step; on failure delete the orphaned clean
      // blob so a rejected upload never leaves a dangling, unreferenced blob
      await deleteStorageSilently(ctx, cleanStorageId)
      throw error
    }
    // client picks up the new avatar via the reactive getMe subscription
    return null
  },
})

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const account = await ctx.runQuery(internal.users.getPasswordAccount, {
      userId,
    })
    if (!account)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'password account not found',
      })
    }
    if (args.newPassword.length < MIN_PASSWORD_LENGTH)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `new password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      })
    }
    if (args.currentPassword === args.newPassword)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'new password must be different from the current password',
      })
    }

    // changing the password invalidates every *other* session, so a missing
    // session id must abort before touching credentials (else we'd nuke this one)
    const currentSessionId = await getAuthSessionId(ctx)
    if (!currentSessionId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'no active session for password change',
      })
    }

    try
    {
      const verified = await retrieveAccount(ctx, {
        provider: 'password',
        account: {
          id: account.providerAccountId,
          secret: args.currentPassword,
        },
      })
      if (verified.user._id !== userId || verified.account.userId !== userId)
      {
        throw new Error('InvalidAccountId')
      }
    }
    catch (error)
    {
      // retrieveAccount throws Error(reason) & shares the sign-in rate limiter;
      // surface the limit distinctly & rethrow the unexpected vs masking it
      const reason = error instanceof Error ? error.message : ''
      if (reason === 'TooManyFailedAttempts')
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.rateLimited,
          message: 'too many failed attempts; try again later',
        })
      }
      if (reason === 'InvalidSecret' || reason === 'InvalidAccountId')
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: 'current password is incorrect',
        })
      }
      throw error
    }

    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: { id: account.providerAccountId, secret: args.newPassword },
    })

    await scheduleAuthSessionCleanup(
      ctx,
      userId,
      { cursor: null, exceptSessionId: currentSessionId },
      'signOutOnly'
    )
    return null
  },
})

// schedule caller auth-session cleanup; the client clears its local token
export const signOutEverywhere = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await scheduleAuthSessionCleanup(
      ctx,
      userId,
      await getInitialAuthSessionState(ctx),
      'signOutOnly'
    )
    return null
  },
})

// schedule caller account deletion through bounded auth & owned-data phases
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

// authSessions is intentionally absent — it's the entry phase reached directly
// via cleanupAuthSessions (mode='startCascade'), then hops here at 'authAccounts'
const CASCADE_PHASES = [
  'authAccounts',
  'boards',
  'templates',
  'rankings',
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
type AuthSessionCleanupMode = (typeof AUTH_SESSION_CLEANUP_MODES)[number]
type SchedulerCtx = Pick<MutationCtx, 'scheduler'>

export const getPasswordAccount = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      providerAccountId: v.string(),
    })
  ),
  handler: async (ctx, args): Promise<{ providerAccountId: string } | null> =>
  {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', args.userId).eq('provider', 'password')
      )
      .unique()
    return account ? { providerAccountId: account.providerAccountId } : null
  },
})

export const commitAvatar = internalMutation({
  args: {
    userId: v.id('users'),
    avatarStorageId: v.id('_storage'),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const user = await ctx.db.get(args.userId)
    if (!user)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'user not found',
      })
    }
    await ctx.db.patch(args.userId, {
      avatarStorageId: args.avatarStorageId,
      updatedAt: Date.now(),
    })
    await scheduleAuthorCardSync(ctx, args.userId)
    return null
  },
})

// drain a revoked session's refresh tokens in bounded pages. revokeSession
// already deleted the session row, so this only sweeps the orphaned children
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

interface AuthSessionCleanupState
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

// shared step for signOutEverywhere & the deleteAccount cascade entry.
// pagination reschedules cleanupAuthSessions (mode preserved); only on
// completion does 'startCascade' kick off cascadeDeleteUserData
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
  const affectedLanes = new Map<Id<'templates'>, Set<string>>()
  for (const ranking of page.page)
  {
    if (!ranking.isPubliclyListable) continue
    const lanes =
      affectedLanes.get(ranking.sourceTemplateId) ?? new Set<string>()
    lanes.add(ranking.sourceCriterionExternalId)
    affectedLanes.set(ranking.sourceTemplateId, lanes)
  }
  await Promise.all(
    [...affectedLanes.entries()].flatMap(([templateId, criterionIds]) =>
      [...criterionIds].map((criterionExternalId) =>
        queueTemplateRankingAggregateRecompute(
          ctx,
          templateId,
          criterionExternalId,
          now
        )
      )
    )
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

const handleBookmarksPhase: CascadePhaseHandler = async (ctx, args) =>
{
  const page = await ctx.db
    .query('userTemplateBookmarks')
    .withIndex('byUserCreatedAt', (q) => q.eq('userId', args.userId))
    .paginate({ numItems: CASCADE_PAGE_SIZE, cursor: args.cursor })

  await Promise.all(page.page.map((bookmark) => ctx.db.delete(bookmark._id)))
  return await advanceCascade(ctx, args.userId, page, 'bookmarks')
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

const getInitialAuthSessionState = async (
  ctx: MutationCtx
): Promise<AuthSessionCleanupState> =>
{
  const targetSessionId = await getAuthSessionId(ctx)
  return targetSessionId
    ? { cursor: null, targetSessionId, tokenCursor: null }
    : { cursor: null }
}

const scheduleAuthSessionCleanup = async (
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

const scheduleAuthorCardSync = async (
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
    { authorId: userId, cursor: null }
  )
}

const assertAvatarStorageMetadata = async (
  ctx: ActionCtx,
  storageId: Id<'_storage'>
): Promise<StorageMetadata> =>
{
  const metadata = await ctx.runQuery(internal.lib.storage.getStorageMetadata, {
    storageId,
  })
  if (!metadata)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.storageMissing,
      message: 'uploaded avatar blob not found in storage',
    })
  }
  if (!metadata.sha256)
  {
    await deleteStorageSilently(ctx, storageId)
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'uploaded avatar blob missing storage sha256 metadata',
    })
  }
  if (metadata.size > MAX_IMAGE_BYTE_SIZE + UPLOAD_ENVELOPE_MAX_HEADER_BYTES)
  {
    await deleteStorageSilently(ctx, storageId)
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.payloadTooLarge,
      message: `uploaded avatar blob too large: ${metadata.size} > ${MAX_IMAGE_BYTE_SIZE}`,
    })
  }
  return metadata
}

const validateUploadedAvatar = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  args: { storageId: Id<'_storage'>; uploadToken: string }
): Promise<Id<'_storage'>> =>
{
  await assertAvatarStorageMetadata(ctx, args.storageId)
  const rawBlob = await ctx.storage.get(args.storageId)
  if (!rawBlob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.storageMissing,
      message: 'uploaded avatar blob not found in storage',
    })
  }

  try
  {
    const wrappedBytes = new Uint8Array(await rawBlob.arrayBuffer())
    const payload = unwrapUploadEnvelope(
      'media',
      userId,
      args.uploadToken,
      wrappedBytes
    )
    if (!payload)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'upload token mismatch for avatar blob',
      })
    }
    if (payload.byteLength < 1 || payload.byteLength > MAX_IMAGE_BYTE_SIZE)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `avatar byteSize out of range: must be 1..${MAX_IMAGE_BYTE_SIZE}`,
      })
    }

    const { mimeType } = parseUploadedImageMetadata(payload)
    return await ctx.storage.store(
      new Blob([payload as BlobPart], { type: mimeType })
    )
  }
  finally
  {
    await deleteStorageSilently(ctx, args.storageId)
  }
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
