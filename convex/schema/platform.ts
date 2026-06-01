// convex/schema/platform.ts
// platform preferences, media, reset, & sharing tables

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  appPreferencesValidator,
  mediaVariantKindValidator,
  mediaVariantSummaryValidator,
} from '../lib/validators/platform'

export const platformTables = {
  // dev-only quiescence marker used by destructive local reset to make
  // self-rescheduling maintenance jobs exit instead of racing table wipes
  devResetLocks: defineTable({
    deploymentMarker: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index('byExpiresAt', ['expiresAt']),
  // per-user global app preferences - mirrors AppPreferences from contracts
  userPreferences: defineTable({
    userId: v.id('users'),
    preferences: appPreferencesValidator,
    updatedAt: v.number(),
  }).index('byUser', ['userId']),
  // logical uploaded image identity; physical blobs live in mediaVariants
  mediaAssets: defineTable({
    ownerId: v.id('users'),
    externalId: v.string(),
    dedupeHash: v.string(),
    tileVariant: mediaVariantSummaryValidator,
    previewVariant: v.optional(mediaVariantSummaryValidator),
    editorVariant: v.optional(mediaVariantSummaryValidator),
    createdAt: v.number(),
  })
    .index('byExternalId', ['externalId'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byOwnerAndDedupeHash', ['ownerId', 'dedupeHash']),
  mediaVariants: defineTable({
    mediaAssetId: v.id('mediaAssets'),
    kind: mediaVariantKindValidator,
    storageId: v.id('_storage'),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
    mimeType: v.string(),
    contentHash: v.string(),
    createdAt: v.number(),
  })
    .index('byMediaAssetAndKind', ['mediaAssetId', 'kind'])
    .index('byStorageId', ['storageId'])
    .index('byContentHash', ['contentHash']),
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
    .index('byOwnerAndExpiresAt', ['ownerId', 'expiresAt'])
    .index('byExpiresAt', ['expiresAt'])
    .index('bySnapshotStorageId', ['snapshotStorageId']),
}
