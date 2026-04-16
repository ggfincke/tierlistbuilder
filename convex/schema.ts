// convex/schema.ts
// * convex database schema — tables for workspace, platform, & community domains

import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  appSettingsValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from './lib/validators'

const shortLinkCommonFields = {
  // short base62 slug exposed in the URL
  slug: v.string(),
  // null for anonymous snapshot shares
  ownerId: v.union(v.id('users'), v.null()),
  createdAt: v.number(),
  // null = persistent, otherwise epoch millis for TTL cleanup
  expiresAt: v.union(v.number(), v.null()),
  viewCount: v.number(),
}

export default defineSchema({
  // @convex-dev/auth tables — authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authRateLimits. do not rename or move — managed by the lib
  ...authTables,

  // users table extended w/ app-specific fields alongside auth-managed ones.
  // auth-managed fields remain writable only by the auth library; app-managed
  // fields populated on first sign-in. do not duplicate auth indexes here
  users: defineTable({
    // auth library-owned fields — must stay in sync w/ authTables.users shape
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // app-owned fields — populated on first sign-in via users upsert
    // stable public identifier used in URLs, exports, & cross-runtime references
    externalId: v.optional(v.string()),
    // display name override — defaults to auth library's name field
    displayName: v.optional(v.string()),
    // convex _storage handle for the avatar image, if uploaded
    avatarStorageId: v.optional(v.id('_storage')),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    // subscription tier — reserved for future premium plan; defaults to "free"
    // optional so auth library can create users rows w/o knowing about tier
    tier: v.optional(v.union(v.literal('free'), v.literal('premium'))),
  })
    // indexes required by @convex-dev/auth — must match authTables.users
    .index('email', ['email'])
    .index('phone', ['phone'])
    // app-specific indexes
    .index('byExternalId', ['externalId']),

  // per-user global app settings — mirrors AppSettings from packages/contracts
  userSettings: defineTable({
    userId: v.id('users'),
    settings: appSettingsValidator,
    updatedAt: v.number(),
  }).index('byUser', ['userId']),

  // top-level board — owned by a user, referenced by tiers, items, & short links
  boards: defineTable({
    externalId: v.string(),
    ownerId: v.id('users'),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // soft delete timestamp — powers "recently deleted boards" restore UI
    deletedAt: v.union(v.number(), v.null()),
    // monotonic revision cursor — bumped atomically on every upsertBoardState
    // mutation & used for optimistic-concurrency conflict detection. optional
    // so createBoard can insert a bare row before the first state upsert
    revision: v.optional(v.number()),
  })
    .index('byOwner', ['ownerId', 'updatedAt'])
    .index('byOwnerAndDeleted', ['ownerId', 'deletedAt'])
    // ordered index powering getMyBoards — eq on (ownerId, deletedAt:null)
    // & order('desc') yields active boards sorted by most-recently-updated
    .index('byOwnerDeletedUpdatedAt', ['ownerId', 'deletedAt', 'updatedAt'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byDeletedAt', ['deletedAt'])
    .index('byExternalId', ['externalId']),

  // tier row within a board — ordered via sparse fractional "order" numbers
  boardTiers: defineTable({
    boardId: v.id('boards'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    // fractional order within the board — insert between siblings w/o rewriting
    order: v.number(),
  })
    .index('byBoard', ['boardId', 'order'])
    .index('byBoardAndExternalId', ['boardId', 'externalId']),

  // single item within a board — either placed in a tier or null for unranked
  boardItems: defineTable({
    boardId: v.id('boards'),
    // null = unranked pool, otherwise references a boardTiers row
    tierId: v.union(v.id('boardTiers'), v.null()),
    externalId: v.string(),
    label: v.optional(v.string()),
    // hex color for text-only items w/o a media asset
    backgroundColor: v.optional(v.string()),
    altText: v.optional(v.string()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    // fractional order within its tier (or within the unranked pool)
    order: v.number(),
    // soft delete timestamp — powers the deleted items restore panel
    deletedAt: v.union(v.number(), v.null()),
    // client-supplied wall-clock stamp for the last edit. reserved for a
    // future last-writer-wins conflict resolver — stored but not enforced.
    // null/undefined on items that predate the field
    clientUpdatedAt: v.optional(v.number()),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byMedia', ['mediaAssetId'])
    .index('byBoardAndExternalId', ['boardId', 'externalId'])
    .index('byBoardAndDeleted', ['boardId', 'deletedAt']),

  // uploaded image metadata — references convex _storage for actual bytes
  mediaAssets: defineTable({
    ownerId: v.id('users'),
    // stable public identifier used by media lookup APIs & board item refs
    externalId: v.string(),
    storageId: v.id('_storage'),
    // sha256 of source bytes — enables dedup on upload via byOwnerAndHash
    contentHash: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
    createdAt: v.optional(v.number()),
  })
    .index('byExternalId', ['externalId'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byOwnerAndHash', ['ownerId', 'contentHash']),

  // reusable tier structure owned by a user — independent of boards
  tierPresets: defineTable({
    externalId: v.string(),
    ownerId: v.id('users'),
    name: v.string(),
    tiers: tierPresetTiersValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byOwner', ['ownerId', 'updatedAt'])
    .index('byExternalId', ['externalId'])
    // ordered lookup for ownership-scoped externalId resolution — mirrors the
    // boards index. lets the preset CRUD mutations short-circuit a separate
    // ownership check after the row lookup
    .index('byOwnerAndExternalId', ['ownerId', 'externalId']),

  // short URL indirection for shareable board links & snapshot blobs
  shortLinks: defineTable(
    v.union(
      v.object({
        ...shortLinkCommonFields,
        // board-share slug — points at a live owned board
        kind: v.literal('board'),
        targetBoardId: v.id('boards'),
      }),
      v.object({
        ...shortLinkCommonFields,
        // snapshot-share slug — points at compressed snapshot bytes in _storage
        kind: v.literal('snapshot'),
        snapshotStorageId: v.id('_storage'),
      })
    )
  )
    .index('bySlug', ['slug'])
    .index('byOwner', ['ownerId'])
    .index('byExpiresAt', ['expiresAt']),
})
