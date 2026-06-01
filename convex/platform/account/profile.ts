// convex/platform/account/profile.ts
// account profile query & mutations

import { v, type Infer } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import {
  DEFAULT_USER_PRIVACY_SETTINGS,
  HANDLE_REGEX,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  MIN_HANDLE_LENGTH,
  PRONOUN_OPTION_SET,
  RESERVED_HANDLES,
  type PublicUserMe,
  type UserPrivacySettings,
} from '@tierlistbuilder/contracts/platform/user'
import { getCurrentUser, requireCurrentUserId } from '../../lib/auth'
import { resolveUserAvatarUrl } from '../../lib/avatar'
import {
  rankingVisibilityValidator,
  templateVisibilityValidator,
} from '../../lib/validators/marketplace'
import {
  failInput,
  normalizeNullableText,
  normalizeRequiredText,
} from '../../lib/text'
import { scheduleAuthorCardSync } from './cardSync'

const RESERVED_HANDLE_SET = new Set<string>(RESERVED_HANDLES)

const userPrivacySettingsValidator = v.object({
  defaultTemplateVisibility: templateVisibilityValidator,
  defaultRankingVisibility: rankingVisibilityValidator,
  showInMembersDirectory: v.boolean(),
  hideProfileFromSearch: v.boolean(),
  allowAiTraining: v.boolean(),
})

// Public getMe projection excludes operator diagnostics & auth internals.
// _id is a plain string because contracts can't depend on Convex Id brands.
// Treat it as an opaque identifier after projection.
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

// Keep TS contract & runtime validator structurally identical.
// Changing one without the other fails compilation.
type _PublicUserMeMatchesValidator =
  PublicUserMe extends Infer<typeof publicUserMeValidator>
    ? Infer<typeof publicUserMeValidator> extends PublicUserMe
      ? true
      : false
    : false
const _publicUserMeContractCheck: _PublicUserMeMatchesValidator = true
void _publicUserMeContractCheck

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
    const avatarUrl = await resolveUserAvatarUrl(ctx, user)
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      displayName: user.displayName ?? null,
      image: avatarUrl,
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
      await scheduleAuthorCardSync(ctx, userId)
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
