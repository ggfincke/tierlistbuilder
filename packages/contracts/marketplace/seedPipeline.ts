// packages/contracts/marketplace/seedPipeline.ts
// marketplace seed pipeline contracts shared by Python, Convex, & reports

import type { TemplateCategory } from './category'
import type { TemplateVisibility } from './template'
import type { MarketplaceTemplateCriterion } from './templateCriterion'
import type {
  MediaVariantKind,
  SupportedImageMimeType,
} from '../platform/media'
import type { ItemTransform } from '../workspace/board'
import type { TierPresetTier } from '../workspace/tierPreset'

export const SEED_MANIFEST_SCHEMA_VERSION = 1

export const SEED_LABEL_POLICIES = [
  'explicit-required',
  'explicit-or-filename-fallback',
  'filename-derived',
  'hidden',
] as const

export type SeedLabelPolicy = (typeof SEED_LABEL_POLICIES)[number]

export const SEED_RELEASE_STATUSES = [
  'building',
  'uploaded',
  'applied_hidden',
  'verified',
  'active',
  'failed',
  'rolled_back',
] as const

export type SeedReleaseStatus = (typeof SEED_RELEASE_STATUSES)[number]

export const SEED_REMOVAL_ACTIONS = ['absentFromRelease', 'hardDelete'] as const

export type SeedRemovalAction = (typeof SEED_REMOVAL_ACTIONS)[number]

export const SEED_RATIO_SOURCES = [
  'consistent',
  'mixed-dominant',
  'mixed-square',
] as const

export type SeedRatioSource = (typeof SEED_RATIO_SOURCES)[number]

export interface SeedReleaseIdentity
{
  datasetKey: string
  releaseId: string
}

export interface SeedRunIdentity extends SeedReleaseIdentity
{
  runId: string
}

export interface SeedSecretInput
{
  seedSecret: string
}

export type SeedRunRequest = SeedRunIdentity & SeedSecretInput

export interface SeedManifestItemInput
{
  externalId: string
  image: string
  label?: string
}

export interface SeedManifestTemplateInput
{
  externalId: string
  folder: string
  title: string
  category: TemplateCategory
  description: string | null
  tags: string[]
  visibility: TemplateVisibility
  labelPolicy: SeedLabelPolicy
  coverImage?: string
  coverZoom?: number
  suggestedTiers?: readonly TierPresetTier[]
  criteria: readonly MarketplaceTemplateCriterion[]
  items: readonly SeedManifestItemInput[]
}

export interface SeedSourceManifest
{
  schemaVersion: typeof SEED_MANIFEST_SCHEMA_VERSION
  datasetKey: string
  releaseId: string
  authorEmail: string
  templates: readonly SeedManifestTemplateInput[]
}

export interface SeedVariantDescriptor
{
  kind: Extract<MediaVariantKind, 'tile' | 'preview'>
  path: string
  contentHash: string
  mimeType: SupportedImageMimeType
  byteSize: number
  width: number
  height: number
  cacheKey: string
}

export interface SeedCropDescriptor
{
  left: number
  top: number
  right: number
  bottom: number
}

export interface SeedCompiledAsset
{
  sourcePath: string
  sourcePathRelative: string
  sourceSha256: string
  sourceMimeType: SupportedImageMimeType
  sourceByteSize: number
  sourceWidth: number
  sourceHeight: number
  sourceAspectRatio: number
  crop: SeedCropDescriptor | null
  variants: {
    tile: SeedVariantDescriptor
    preview: SeedVariantDescriptor
  }
}

export interface SeedCompiledItem
{
  externalId: string
  order: number
  image: string
  label: string
  aspectRatio: number
  transform: ItemTransform | null
  asset: SeedCompiledAsset
}

export interface SeedCompiledTemplate
{
  externalId: string
  folder: string
  title: string
  category: TemplateCategory
  description: string | null
  tags: string[]
  visibility: TemplateVisibility
  labelPolicy: SeedLabelPolicy
  itemAspectRatio: number
  ratioSource: SeedRatioSource
  coverImage?: SeedCompiledAsset
  coverZoom?: number
  criteria: readonly MarketplaceTemplateCriterion[]
  items: readonly SeedCompiledItem[]
}

export interface SeedCompiledTotals
{
  templateCount: number
  itemCount: number
  criterionCount: number
  sourceImageCount: number
  variantCount: number
  estimatedUploadBytes: number
  estimatedStorageBytes: number
}

export interface SeedDiagnostic
{
  code: string
  message: string
  path: string
  severity: 'warning' | 'error'
}

export interface SeedCompiledManifest
{
  schemaVersion: typeof SEED_MANIFEST_SCHEMA_VERSION
  datasetKey: string
  releaseId: string
  authorEmail: string
  sourceManifestPath: string
  generatedAt: string
  variantSpecVersion: string
  totals: SeedCompiledTotals
  templates: readonly SeedCompiledTemplate[]
  warnings: readonly SeedDiagnostic[]
  errors: readonly SeedDiagnostic[]
}

export interface SeedRunSummary
{
  runId: string
  datasetKey: string
  releaseId: string
  status: SeedReleaseStatus
  startedAt: number
  finishedAt: number | null
  startedBy: string
  templateCount: number
  itemCount: number
  imageVariantCount: number
  uploadedBytes: number
  error: string | null
}

export interface SeedBeginRunInput extends SeedRunRequest
{
  templateCount: number
  itemCount: number
  imageVariantCount: number
}

export interface SeedBeginRunOutput
{
  run: SeedRunSummary
}

export interface SeedExternalIds
{
  authorEmail: string
  templateExternalIds: readonly string[]
  itemExternalIds: readonly SeedTemplateItemKey[]
  criterionExternalIds: readonly SeedTemplateCriterionKey[]
  variantHashes: readonly string[]
}

export type SeedResolveStateInput = SeedReleaseIdentity &
  SeedSecretInput &
  SeedExternalIds

export interface SeedResolvedTemplate
{
  externalId: string
  templateId: string
  releaseId: string | null
  title: string
  description: string | null
  category: TemplateCategory
  tags: readonly string[]
  visibility: TemplateVisibility
  status: SeedReleaseStatus | null
  itemAspectRatio: number | null
}

export interface SeedResolvedItem
{
  templateExternalId: string
  itemExternalId: string
  itemId: string
  order: number
  label: string | null
  mediaAssetId: string | null
}

export interface SeedResolvedCriterion
{
  templateExternalId: string
  criterionExternalId: string
  criterionId: string
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
  variantKind: MediaVariantKind
  byteSize: number
}

export interface SeedReleaseRemovalCandidate
{
  templateExternalId: string
  itemExternalId?: string
  criterionExternalId?: string
  action: Extract<SeedRemovalAction, 'absentFromRelease'>
}

export interface SeedResolveStateOutput
{
  activeReleaseId: string | null
  templates: readonly SeedResolvedTemplate[]
  items: readonly SeedResolvedItem[]
  criteria: readonly SeedResolvedCriterion[]
  media: readonly SeedResolvedMedia[]
  absentFromManifest: readonly SeedReleaseRemovalCandidate[]
}

export interface SeedResolveMediaByHashesInput
  extends SeedReleaseIdentity, SeedSecretInput
  {
  authorEmail: string
  variantHashes: readonly string[]
}

export interface SeedResolveMediaByHashesOutput
{
  media: readonly SeedResolvedMedia[]
}

export interface SeedGenerateUploadUrlsInput extends SeedRunRequest
{
  variants: readonly SeedUploadVariantRequest[]
}

export interface SeedUploadVariantRequest
{
  contentHash: string
  kind: Extract<MediaVariantKind, 'tile' | 'preview'>
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
  urls: readonly SeedUploadUrl[]
}

export interface SeedUploadedVariant
{
  contentHash: string
  storageId: string
  kind: Extract<MediaVariantKind, 'tile' | 'preview'>
  expectedMimeType: SupportedImageMimeType
  expectedByteSize: number
  expectedWidth: number
  expectedHeight: number
}

export interface SeedFinalizeUploadedMediaInput extends SeedRunRequest
{
  authorEmail: string
  assets: readonly SeedUploadedMediaAsset[]
}

export interface SeedUploadedMediaAsset
{
  assetKey: string
  variants: readonly SeedUploadedVariant[]
}

export interface SeedFinalizeUploadedMediaOutput
{
  finalized: readonly SeedFinalizedMedia[]
  rejected: readonly SeedRejectedUpload[]
}

export interface SeedFinalizedMedia
{
  assetKey: string
  contentHashes: readonly string[]
  mediaAssetId: string
  reused: boolean
}

export interface SeedRejectedUpload
{
  contentHash: string
  storageId: string
  reason: string
  cleaned: boolean
}

export interface SeedCleanupRejectedUploadsInput extends SeedRunRequest
{
  storageIds: readonly string[]
}

export interface SeedCleanupAbandonedRunInput extends SeedRunRequest
{
  storageIds: readonly string[]
}

export interface SeedCleanupOutput
{
  cleanedStorageIds: readonly string[]
  missingStorageIds: readonly string[]
}

export interface SeedUpsertTemplatesInput extends SeedRunRequest
{
  templates: readonly SeedTemplateUpsert[]
}

export interface SeedTemplateUpsert
{
  externalId: string
  title: string
  category: TemplateCategory
  description: string | null
  tags: readonly string[]
  visibility: TemplateVisibility
  coverMediaContentHash: string | null
  coverZoom?: number
}

export interface SeedTemplateUpsertOutput
{
  created: readonly string[]
  updated: readonly string[]
  unchanged: readonly string[]
}

export interface SeedUpsertItemsInput extends SeedRunRequest
{
  items: readonly SeedItemUpsert[]
}

export interface SeedTemplateItemKey
{
  templateExternalId: string
  itemExternalId: string
}

export interface SeedItemUpsert extends SeedTemplateItemKey
{
  order: number
  label: string | null
  mediaContentHash: string
}

export interface SeedItemUpsertOutput
{
  created: readonly SeedTemplateItemKey[]
  updated: readonly SeedTemplateItemKey[]
  moved: readonly SeedTemplateItemKey[]
  unchanged: readonly SeedTemplateItemKey[]
  absentFromRelease: readonly SeedTemplateItemKey[]
}

export interface SeedUpsertCriteriaInput extends SeedRunRequest
{
  criteria: readonly SeedCriterionUpsert[]
}

export interface SeedTemplateCriterionKey
{
  templateExternalId: string
  criterionExternalId: string
}

export type SeedCriterionUpsert = SeedTemplateCriterionKey &
  Omit<MarketplaceTemplateCriterion, 'externalId'>

export interface SeedCriterionUpsertOutput
{
  created: readonly SeedTemplateCriterionKey[]
  updated: readonly SeedTemplateCriterionKey[]
  unchanged: readonly SeedTemplateCriterionKey[]
  deactivated: readonly SeedTemplateCriterionKey[]
}

export interface SeedVerifyReleaseInput extends SeedRunRequest
{
  expectedTotals: SeedCompiledTotals
}

export interface SeedVerifyReleaseOutput
{
  verified: boolean
  diagnostics: readonly SeedDiagnostic[]
}

export interface SeedActivateReleaseInput extends SeedRunRequest
{
  previousReleaseId: string | null
  confirm: true
}

export interface SeedActivateReleaseOutput
{
  activeReleaseId: string
  previousReleaseId: string | null
}

export interface SeedRollbackReleaseInput extends SeedRunRequest
{
  targetReleaseId: string
  confirm: true
}

export interface SeedRollbackReleaseOutput
{
  activeReleaseId: string
  rolledBackReleaseId: string
}

export type SeedRunStatusInput = SeedRunRequest

export interface SeedRunStatusOutput
{
  run: SeedRunSummary | null
}
