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

export default defineSchema({
  // @convex-dev/auth tables — authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authRateLimits. do not rename or move — managed by the lib
  ...authTables,

  // users table extended w/ app-specific fields alongside auth-managed ones.
  // auth-managed fields remain writable only by the auth library; app-managed
  // fields populated on first sign-in. do not duplicate auth indexes here
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    externalId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    tier: v.optional(v.union(v.literal('free'), v.literal('premium'))),
    lastUpsertError: v.optional(v.string()),
  })
    // indexes required by @convex-dev/auth - must match authTables.users
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('byAvatarStorageId', ['avatarStorageId']),

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
    deletedAt: v.union(v.number(), v.null()),
    revision: v.optional(v.number()),
    // slot aspect ratio (w/h); absent -> 1 (square)
    itemAspectRatio: v.optional(v.number()),
    // 'auto' tracks content, 'manual' pins to itemAspectRatio
    itemAspectRatioMode: v.optional(
      v.union(v.literal('auto'), v.literal('manual'))
    ),
    // suppresses the mixed-ratio modal on this board
    aspectRatioPromptDismissed: v.optional(v.boolean()),
    // board-wide fit when an item has no override
    defaultItemImageFit: v.optional(
      v.union(v.literal('cover'), v.literal('contain'))
    ),
  })
    // ordered index powering getMyBoards & getMyDeletedBoards — eq on (ownerId,
    // deletedAt) + order('desc') yields the active or deleted set sorted by
    // most-recently-updated first
    .index('byOwnerDeletedUpdatedAt', ['ownerId', 'deletedAt', 'updatedAt'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byDeletedAt', ['deletedAt']),

  // tier row within a board — ordered via sparse fractional "order" numbers
  boardTiers: defineTable({
    boardId: v.id('boards'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    order: v.number(),
  }).index('byBoard', ['boardId', 'order']),

  // single item within a board — either placed in a tier or null for unranked
  boardItems: defineTable({
    boardId: v.id('boards'),
    tierId: v.union(v.id('boardTiers'), v.null()),
    externalId: v.string(),
    label: v.optional(v.string()),
    backgroundColor: v.optional(v.string()),
    altText: v.optional(v.string()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    deletedAt: v.union(v.number(), v.null()),
    // natural image aspect ratio captured at import time
    aspectRatio: v.optional(v.number()),
    // per-item crop override
    imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byMedia', ['mediaAssetId']),

  // uploaded image metadata — references convex _storage for actual bytes
  mediaAssets: defineTable({
    ownerId: v.id('users'),
    externalId: v.string(),
    storageId: v.id('_storage'),
    contentHash: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
    createdAt: v.number(),
  })
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byOwnerAndHash', ['ownerId', 'contentHash'])
    .index('byStorageId', ['storageId']),

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
    // ordered lookup for ownership-scoped externalId resolution — lets the
    // preset CRUD mutations short-circuit a separate ownership check after
    // the row lookup
    .index('byOwnerAndExternalId', ['ownerId', 'externalId']),

  // short URL indirection for shareable snapshot blobs. slug -> compressed
  // BoardSnapshot bytes in _storage
  shortLinks: defineTable({
    slug: v.string(),
    ownerId: v.id('users'),
    snapshotStorageId: v.id('_storage'),
    createdAt: v.number(),
    expiresAt: v.number(),
    boardTitle: v.string(),
  })
    .index('bySlug', ['slug'])
    .index('byOwner', ['ownerId'])
    .index('byExpiresAt', ['expiresAt'])
    .index('bySnapshotStorageId', ['snapshotStorageId']),
})
