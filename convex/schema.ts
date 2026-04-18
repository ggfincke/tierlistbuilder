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
    isAnonymous: v.optional(v.boolean()),
    externalId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    tier: v.union(v.literal('free'), v.literal('premium')),
    lastUpsertError: v.optional(v.string()),
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
    deletedAt: v.union(v.number(), v.null()),
    revision: v.optional(v.number()),
  })
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
    order: v.number(),
  })
    .index('byBoard', ['boardId', 'order'])
    .index('byBoardAndExternalId', ['boardId', 'externalId']),

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
    clientUpdatedAt: v.optional(v.number()),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byMedia', ['mediaAssetId'])
    .index('byBoardAndExternalId', ['boardId', 'externalId'])
    .index('byBoardAndDeleted', ['boardId', 'deletedAt']),

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

  // short URL indirection for shareable snapshot blobs. slug -> compressed BoardSnapshot
  // bytes in _storage. live "follow my board" links were deferred — adding them later
  // warrants a separate design pass, so the schema is not pre-shaped for it
  shortLinks: defineTable({
    slug: v.string(),
    ownerId: v.union(v.id('users'), v.null()),
    snapshotStorageId: v.id('_storage'),
    createdAt: v.number(),
    expiresAt: v.union(v.number(), v.null()),
    boardTitle: v.optional(v.string()),
  })
    .index('bySlug', ['slug'])
    .index('byOwner', ['ownerId'])
    .index('byExpiresAt', ['expiresAt'])
    // reverse lookup for storage-blob GC so gcOrphanedStorage can ask
    // "is this blob referenced by any shortLink?" w/o scanning the table
    .index('bySnapshotStorageId', ['snapshotStorageId']),
})
