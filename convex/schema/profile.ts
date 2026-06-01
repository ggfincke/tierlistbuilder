// convex/schema/profile.ts
// user account & profile showcase tables

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { userPlanValidator } from '../lib/validators/platform'
import {
  rankingVisibilityValidator,
  templateVisibilityValidator,
} from '../lib/validators/marketplace'
import { tierColorSpecValidator } from '../lib/validators/common'

export const profileTables = {
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
    plan: v.optional(userPlanValidator),
    lastUpsertError: v.optional(v.string()),
    // public-profile fields - surfaced via /u/:handle once that route exists.
    // handle is lowercase a-z/0-9/_/- ; uniqueness enforced via byHandle index
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    defaultTemplateVisibility: v.optional(templateVisibilityValidator),
    defaultRankingVisibility: v.optional(rankingVisibilityValidator),
    showInMembersDirectory: v.optional(v.boolean()),
    hideProfileFromSearch: v.optional(v.boolean()),
    allowAiTraining: v.optional(v.boolean()),
  })
    // indexes required by @convex-dev/auth - must match authTables.users
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('byAvatarStorageId', ['avatarStorageId'])
    .index('byHandle', ['handle']),
  // "tier list of tier lists" (tlotl) - the profile showcase. one row per
  // owner; tiers & placed ranking lanes live in child tables. the unranked
  // pool is derived (owner's published lanes minus placed), never stored
  profileShowcases: defineTable({
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('byOwner', ['ownerId']),
  // tier row within a profile showcase - mirrors boardTiers so the workspace
  // editor's tier data maps in & out w/o translation
  profileShowcaseTiers: defineTable({
    showcaseId: v.id('profileShowcases'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    order: v.number(),
  }).index('byShowcase', ['showcaseId', 'order']),
  // a published board placed in a showcase tier. references the owner's BOARD,
  // not a ranking instance, so it follows the board's current live ranking
  // (board.livePublicRankingId) across re-publishes. unplaced boards are derived
  profileShowcaseItems: defineTable({
    showcaseId: v.id('profileShowcases'),
    tierExternalId: v.string(),
    boardId: v.id('boards'),
    order: v.number(),
  }).index('byShowcase', ['showcaseId', 'order']),
}
