// convex/marketplace/rankings/seedValidators.ts
// validators for seed-gated ranking manifests & reports

import { v, type Infer } from 'convex/values'
import {
  rankingFeaturedBadgeValidator,
  seedRankingReleaseStatusValidator,
  tierPresetTierValidator,
} from '../../lib/validators'

export const seedRankingTermOverridesValidator = v.record(
  v.string(),
  v.array(v.string())
)

export const seedRankingProfileValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  chaos: v.number(),
  contrarian: v.number(),
  boostTermsByTarget: v.optional(seedRankingTermOverridesValidator),
  dropTermsByTarget: v.optional(seedRankingTermOverridesValidator),
})

export const seedRankingFeaturedProfileValidator = v.object({
  profileKey: v.string(),
  featuredRank: v.number(),
  featuredBadge: rankingFeaturedBadgeValidator,
})

export const seedRankingLaneValidator = v.object({
  criterionExternalId: v.string(),
  titleSuffix: v.string(),
  description: v.string(),
  boostTerms: v.array(v.string()),
  dropTerms: v.array(v.string()),
  profileBoostOverrides: v.optional(seedRankingTermOverridesValidator),
  profileDropOverrides: v.optional(seedRankingTermOverridesValidator),
  chaosMultiplier: v.optional(v.number()),
  contrarianMultiplier: v.optional(v.number()),
  featuredProfiles: v.optional(v.array(seedRankingFeaturedProfileValidator)),
})

export const seedCuratedTierGroupValidator = v.object({
  tierName: v.string(),
  labels: v.array(v.string()),
})

export const seedCuratedRankingValidator = v.object({
  externalId: v.string(),
  authorKey: v.string(),
  authorDisplayName: v.string(),
  criterionExternalId: v.string(),
  title: v.string(),
  description: v.string(),
  featuredRank: v.union(v.number(), v.null()),
  featuredBadge: v.union(rankingFeaturedBadgeValidator, v.null()),
  coverage: v.union(
    v.literal('full-template'),
    v.literal('partial-authoritative')
  ),
  parentLabelByLabel: v.optional(v.record(v.string(), v.string())),
  tiers: v.array(tierPresetTierValidator),
  tierGroups: v.array(seedCuratedTierGroupValidator),
})

export const seedRankingTargetValidator = v.object({
  templateExternalId: v.string(),
  sampleProfileCount: v.optional(v.number()),
  countAsTemplateUse: v.optional(v.boolean()),
  lanes: v.array(seedRankingLaneValidator),
  curatedRankings: v.optional(v.array(seedCuratedRankingValidator)),
})

export const seedRankingsManifestValidator = v.object({
  profileSet: v.string(),
  defaultProfileCount: v.number(),
  includeAllTemplates: v.optional(v.boolean()),
  profiles: v.array(seedRankingProfileValidator),
  targets: v.array(seedRankingTargetValidator),
})

export const seedRankingDiagnosticValidator = v.object({
  code: v.string(),
  message: v.string(),
  path: v.string(),
  severity: v.union(v.literal('warning'), v.literal('error')),
})

export const seedRankingLaneSummaryValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  sampleRankings: v.number(),
  curatedRankings: v.number(),
})

export const seedRankingPreflightResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  profileCount: v.number(),
  authorCount: v.number(),
  targetCount: v.number(),
  sampleRankingsPlanned: v.number(),
  curatedRankingsPlanned: v.number(),
  existingSeedRankings: v.number(),
  existingActiveSeedRankings: v.number(),
  aggregateLanes: v.array(seedRankingLaneSummaryValidator),
  diagnostics: v.array(seedRankingDiagnosticValidator),
})

export const seedRankingApplyResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  authorsCreated: v.number(),
  authorsReused: v.number(),
  authorsPatched: v.number(),
  boardsReplaced: v.number(),
  rankingsReplaced: v.number(),
  rankingsUnchanged: v.number(),
  sampleRankingsApplied: v.number(),
  curatedRankingsApplied: v.number(),
  rankingsApplied: v.number(),
  rankingTiersWritten: v.number(),
  rankingItemsWritten: v.number(),
  aggregateLanes: v.array(seedRankingLaneSummaryValidator),
  diagnostics: v.array(seedRankingDiagnosticValidator),
})

export const seedRankingAuthorEnsureResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  authorsCreated: v.number(),
  authorsReused: v.number(),
  authorsPatched: v.number(),
  diagnostics: v.array(seedRankingDiagnosticValidator),
})

export const seedRankingActivationResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  activatedRankings: v.number(),
  rolledBackRankings: v.number(),
  aggregateJobsQueued: v.number(),
})

export const seedRankingReleaseStatusArgValidator = v.union(
  seedRankingReleaseStatusValidator,
  v.null()
)

export type SeedRankingsManifest = Infer<typeof seedRankingsManifestValidator>
export type SeedRankingProfile = Infer<typeof seedRankingProfileValidator>
export type SeedRankingTarget = Infer<typeof seedRankingTargetValidator>
export type SeedRankingLane = Infer<typeof seedRankingLaneValidator>
export type SeedCuratedRanking = Infer<typeof seedCuratedRankingValidator>
export type SeedRankingDiagnostic = Infer<typeof seedRankingDiagnosticValidator>
export type SeedRankingLaneSummary = Infer<
  typeof seedRankingLaneSummaryValidator
>
export type SeedRankingApplyResult = Infer<
  typeof seedRankingApplyResultValidator
>
export type SeedRankingAuthorEnsureResult = Infer<
  typeof seedRankingAuthorEnsureResultValidator
>
export type SeedRankingPreflightResult = Infer<
  typeof seedRankingPreflightResultValidator
>
export type SeedRankingActivationResult = Infer<
  typeof seedRankingActivationResultValidator
>
