// packages/contracts/marketplace/seedPipeline.ts
// marketplace seed pipeline contracts shared by Python, Convex, & reports

import type { TemplateCategory } from './category'
import type { RankingFeaturedBadge } from './ranking'
import type { TemplateCoverFraming } from '../lib/coverMedia'
import type { TemplateVisibility } from './template'

import type { MarketplaceTemplateCriterion } from './templateCriterion'
import type {
  MediaVariantKind,
  SupportedImageMimeType,
} from '../platform/media'
import type {
  BoardAutoPlateSettings,
  BoardLabelSettings,
  ItemTransform,
  MediaPlate,
} from '../workspace/board'
import type { TierPresetTier } from '../workspace/tierPreset'

// canonical seed content-hash format. Convex (TS) & Python MUST produce
// byte-identical hashes for the same input: canonical JSON for {kind, payload};
// sha256 utf-8 bytes; versioned truncated digest.
export const SEED_CONTENT_HASH_VERSION = 'v1' as const
export const SEED_CONTENT_HASH_HEX_LENGTH = 32

export const SEED_RUN_STATUSES = [
  'building',
  'verified',
  'active',
  'failed',
  'rolled_back',
] as const

export type SeedRunStatus = (typeof SEED_RUN_STATUSES)[number]

export const SEED_TEMPLATE_RELEASE_STATUSES = [
  'applied_hidden',
  'verified',
  'active',
  'rolled_back',
] as const

export type SeedTemplateReleaseStatus =
  (typeof SEED_TEMPLATE_RELEASE_STATUSES)[number]

export const SEED_RANKING_RELEASE_STATUSES = [
  'applied_hidden',
  'active',
  'rolled_back',
] as const

export type SeedRankingReleaseStatus =
  (typeof SEED_RANKING_RELEASE_STATUSES)[number]

export const SEED_TEMPLATE_LABEL_POLICIES = [
  'explicit-required',
  'explicit-or-filename-fallback',
  'filename-derived',
  'hidden',
] as const

// Python owns source/compiled manifest shapes; JSON Schema validates them.

export interface SeedRunSummary
{
  runId: string
  datasetKey: string
  releaseId: string
  status: SeedRunStatus
  startedAt: number
  finishedAt: number | null
  startedBy: string
  templateCount: number
  itemCount: number
  imageVariantCount: number
  error: string | null
}

export interface SeedBeginRunOutput
{
  run: SeedRunSummary
}

export interface SeedResolvedTemplate
{
  externalId: string
  releaseId: string | null
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  status: SeedTemplateReleaseStatus | null
  itemAspectRatio: number | null
  metadataContentHash: string | null
  itemsContentHash: string | null
  styleItemsContentHash: string | null
  criteriaContentHash: string | null
}

export interface SeedResolvedItem
{
  templateExternalId: string
  itemExternalId: string
  order: number
  label: string | null
  mediaAssetId: string | null
  mediaContentHash: string | null
  mediaDedupeHash: string | null
  aspectRatio: number | null
  transform: ItemTransform | null
  mediaPlate: MediaPlate | null
  imagePadding: number | null
  backgroundColor: string | null
}

export interface SeedResolvedCriterion
{
  templateExternalId: string
  criterionExternalId: string
  name: string
  shortName: string | null
  prompt: string
  axisTop: string | null
  axisBottom: string | null
  order: number
  isPrimary: boolean
  status: MarketplaceTemplateCriterion['status']
}

export interface SeedResolvedMedia
{
  contentHash: string
  mediaAssetId: string
  mediaDedupeHash: string
  variantKind: MediaVariantKind
  byteSize: number
}

export interface SeedResolveStateOutput
{
  activeReleaseId: string | null
  templates: SeedResolvedTemplate[]
  items: SeedResolvedItem[]
  criteria: SeedResolvedCriterion[]
  media: SeedResolvedMedia[]
}

export interface SeedResolveMediaByHashesOutput
{
  media: SeedResolvedMedia[]
}

type SeedRankingTermOverrides = Record<string, string[]>

export interface SeedRankingProfile
{
  key: string
  displayName: string
  chaos: number
  contrarian: number
  boostTermsByTarget: SeedRankingTermOverrides
  dropTermsByTarget: SeedRankingTermOverrides
}

interface SeedRankingFeaturedProfile
{
  profileKey: string
  featuredRank: number
  featuredBadge: RankingFeaturedBadge
}

export interface SeedRankingLane
{
  criterionExternalId: string
  titleSuffix: string
  description: string
  boostTerms: string[]
  dropTerms: string[]
  profileBoostOverrides: SeedRankingTermOverrides
  profileDropOverrides: SeedRankingTermOverrides
  chaosMultiplier: number
  contrarianMultiplier: number
  featuredProfiles: SeedRankingFeaturedProfile[]
}

interface SeedCuratedTierGroup
{
  tierName: string
  labels: string[]
}

export interface SeedCuratedRanking
{
  externalId: string
  authorKey: string
  authorDisplayName: string
  criterionExternalId: string
  title: string
  description: string
  featuredRank: number | null
  featuredBadge: RankingFeaturedBadge | null
  coverage: 'full-template' | 'partial-authoritative'
  parentLabelByLabel: Record<string, string>
  tiers: TierPresetTier[]
  tierGroups: SeedCuratedTierGroup[]
}

export interface SeedRankingTarget
{
  templateExternalId: string
  sampleProfileCount: number
  countAsTemplateUse: boolean
  lanes: SeedRankingLane[]
  curatedRankings: SeedCuratedRanking[]
}

export interface SeedRankingsManifest
{
  profileSet: string
  defaultProfileCount: number
  includeAllTemplates: boolean
  profiles: SeedRankingProfile[]
  targets: SeedRankingTarget[]
}

export interface SeedUploadVariantRequest
{
  contentHash: string
  kind: Extract<MediaVariantKind, 'tile' | 'preview' | 'editor'>
  mimeType: SupportedImageMimeType
  byteSize: number
}

export interface SeedUploadUrl
{
  contentHash: string
  uploadUrl: string
  expiresAt: number
}

export interface SeedGenerateUploadUrlsOutput
{
  urls: SeedUploadUrl[]
}

export interface SeedRegisterUploadedStorageIdsOutput
{
  registeredStorageIds: string[]
}

export interface SeedUploadedVariant
{
  contentHash: string
  storageId: string
  kind: Extract<MediaVariantKind, 'tile' | 'preview' | 'editor'>
  expectedMimeType: SupportedImageMimeType
  expectedByteSize: number
  expectedWidth: number
  expectedHeight: number
}

export interface SeedUploadedMediaAsset
{
  assetKey: string
  variants: SeedUploadedVariant[]
}

export interface SeedFinalizeUploadedMediaOutput
{
  finalized: SeedFinalizedMedia[]
  rejected: SeedRejectedUpload[]
}

export interface SeedFinalizedMedia
{
  assetKey: string
  contentHashes: string[]
  mediaAssetId: string
  reused: boolean
}

export interface SeedRejectedUpload
{
  assetKey: string
  contentHash: string
  storageId: string
  reason: string
  cleaned: boolean
}

export interface SeedCleanupOutput
{
  cleanedStorageIds: string[]
  missingStorageIds: string[]
  skippedStorageIds: string[]
}

// per-template image style (skin) metadata row. the default style's per-item
// images live on the template items; non-default styles sync them separately
export interface SeedTemplateStyle
{
  externalId: string
  label: string
  order: number
  isDefault: boolean
  coverMediaDedupeHash: string | null
  itemAspectRatio: number | null
  defaultItemImagePadding: number | null
  labels?: BoardLabelSettings
  autoPlate?: BoardAutoPlateSettings
}

export interface SeedTemplateUpsert
{
  externalId: string
  metadataContentHash: string
  title: string
  category: TemplateCategory
  description: string | null
  tags: string[]
  visibility: TemplateVisibility
  coverMediaDedupeHash: string | null
  coverFraming: TemplateCoverFraming | null
  suggestedTiers: TierPresetTier[]
  itemAspectRatio: number
  itemCount: number
  defaultItemImagePadding: number | null
  labels?: BoardLabelSettings
  // per-template logo backdrop pinned at publish; absent -> On+Auto default
  autoPlate?: BoardAutoPlateSettings
  // image styles (skins) for this template; absent -> single-skin template
  styles?: SeedTemplateStyle[]
  defaultStyleId?: string | null
}

export interface SeedTemplateUpsertOutput
{
  created: string[]
  updated: string[]
  unchanged: string[]
}

export interface SeedTemplateItemKey
{
  templateExternalId: string
  itemExternalId: string
}

export interface SeedItemUpsert
{
  itemExternalId: string
  order: number
  label: string | null
  mediaDedupeHash: string
  aspectRatio: number | null
  transform: ItemTransform | null
  mediaPlate: MediaPlate | null
  imagePadding: number | null
  // curated per-item backdrop (e.g. a dark card for a white logo on a uniform
  // white wall); null -> none. always wins over board autoPlate at render time
  backgroundColor: string | null
}

export interface SeedSyncTemplateItemsOutput
{
  created: SeedTemplateItemKey[]
  updated: SeedTemplateItemKey[]
  moved: SeedTemplateItemKey[]
  unchanged: SeedTemplateItemKey[]
  deleted: SeedTemplateItemKey[]
}

export interface SeedTemplateStyleItemKey
{
  templateExternalId: string
  styleExternalId: string
  itemExternalId: string
}

export interface SeedTemplateStyleItemUpsert
{
  itemExternalId: string
  mediaDedupeHash: string | null
  aspectRatio: number | null
  transform: ItemTransform | null
  mediaPlate: MediaPlate | null
  imagePadding: number | null
}

export interface SeedSyncTemplateStyleItemsOutput
{
  created: SeedTemplateStyleItemKey[]
  updated: SeedTemplateStyleItemKey[]
  unchanged: SeedTemplateStyleItemKey[]
  deleted: SeedTemplateStyleItemKey[]
}

export interface SeedTemplateCriterionKey
{
  templateExternalId: string
  criterionExternalId: string
}

export type SeedCriterionUpsert = SeedTemplateCriterionKey &
  Omit<MarketplaceTemplateCriterion, 'externalId'> & {
    criteriaContentHash: string
  }

export interface SeedCriterionUpsertOutput
{
  created: SeedTemplateCriterionKey[]
  updated: SeedTemplateCriterionKey[]
  unchanged: SeedTemplateCriterionKey[]
  deactivated: SeedTemplateCriterionKey[]
}

export type SeedDiagnostic = {
  code: string
  message: string
  path: string
  severity: 'warning' | 'error'
}

export interface SeedVerifyReleaseOutput
{
  verified: boolean
  diagnostics: SeedDiagnostic[]
}

export interface SeedActivateReleaseOutput
{
  activeReleaseId: string
  previousReleaseId: string | null
}

export interface SeedRollbackReleaseOutput
{
  activeReleaseId: string
  rolledBackReleaseId: string
}

export interface SeedRunStatusOutput
{
  run: SeedRunSummary | null
}
