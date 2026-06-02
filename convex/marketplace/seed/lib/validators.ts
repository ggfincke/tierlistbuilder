// convex/marketplace/seed/lib/validators.ts
// Convex object/union validators for seed-pipeline mutations, actions, & queries

import { v } from 'convex/values'
import {
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  itemTransformValidator,
  mediaPlateNullableValidator,
  tierPresetTiersValidator,
} from '../../../lib/validators/common'
import {
  imageMimeTypeValidator,
  mediaVariantKindValidator,
} from '../../../lib/validators/platform'
import {
  seedRunStatusValidator,
  seedTemplateReleaseStatusValidator,
} from '../../../lib/validators/seedPipeline'
import {
  templateCategoryValidator,
  templateCoverFramingValidator,
  templateCriterionStatusValidator,
  templateVisibilityValidator,
} from '../../../lib/validators/marketplace'

export const seedUploadVariantKindValidator = v.union(
  v.literal('tile'),
  v.literal('preview'),
  v.literal('editor')
)

export const seedRunSummaryValidator = v.object({
  runId: v.string(),
  datasetKey: v.string(),
  releaseId: v.string(),
  status: seedRunStatusValidator,
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  startedBy: v.string(),
  templateCount: v.number(),
  itemCount: v.number(),
  imageVariantCount: v.number(),
  error: v.union(v.string(), v.null()),
})

export const seedTemplateItemKeyValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
})

export const seedTemplateCriterionKeyValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
})

export const seedResolvedTemplateValidator = v.object({
  externalId: v.string(),
  releaseId: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  category: templateCategoryValidator,
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  status: v.union(seedTemplateReleaseStatusValidator, v.null()),
  itemAspectRatio: v.union(v.number(), v.null()),
  metadataContentHash: v.union(v.string(), v.null()),
  itemsContentHash: v.union(v.string(), v.null()),
  styleItemsContentHash: v.union(v.string(), v.null()),
  criteriaContentHash: v.union(v.string(), v.null()),
})

export const seedResolvedItemValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
  order: v.number(),
  label: v.union(v.string(), v.null()),
  mediaAssetId: v.union(v.string(), v.null()),
  mediaContentHash: v.union(v.string(), v.null()),
  mediaDedupeHash: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
  mediaPlate: mediaPlateNullableValidator,
  imagePadding: v.union(v.number(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
})

export const seedResolvedCriterionValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  prompt: v.string(),
  axisTop: v.union(v.string(), v.null()),
  axisBottom: v.union(v.string(), v.null()),
  order: v.number(),
  isPrimary: v.boolean(),
  status: templateCriterionStatusValidator,
})

export const seedResolvedMediaValidator = v.object({
  contentHash: v.string(),
  mediaAssetId: v.string(),
  mediaDedupeHash: v.string(),
  variantKind: mediaVariantKindValidator,
  byteSize: v.number(),
})

export const seedUploadVariantRequestValidator = v.object({
  contentHash: v.string(),
  kind: seedUploadVariantKindValidator,
  mimeType: imageMimeTypeValidator,
  byteSize: v.number(),
})

export const seedUploadUrlValidator = v.object({
  contentHash: v.string(),
  uploadUrl: v.string(),
  expiresAt: v.number(),
})

export const seedUploadedVariantValidator = v.object({
  contentHash: v.string(),
  storageId: v.id('_storage'),
  kind: seedUploadVariantKindValidator,
  expectedMimeType: imageMimeTypeValidator,
  expectedByteSize: v.number(),
  expectedWidth: v.number(),
  expectedHeight: v.number(),
})

export const seedUploadedMediaAssetValidator = v.object({
  assetKey: v.string(),
  variants: v.array(seedUploadedVariantValidator),
})

export const seedTemplateStyleValidator = v.object({
  externalId: v.string(),
  label: v.string(),
  order: v.number(),
  isDefault: v.boolean(),
  coverMediaDedupeHash: v.union(v.string(), v.null()),
  itemAspectRatio: v.union(v.number(), v.null()),
  defaultItemImagePadding: v.union(v.number(), v.null()),
  labels: v.optional(boardLabelSettingsValidator),
  autoPlate: v.optional(boardAutoPlateSettingsValidator),
})

export const seedTemplateUpsertValidator = v.object({
  externalId: v.string(),
  metadataContentHash: v.string(),
  title: v.string(),
  category: templateCategoryValidator,
  description: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  coverMediaDedupeHash: v.union(v.string(), v.null()),
  coverFraming: v.union(templateCoverFramingValidator, v.null()),
  suggestedTiers: tierPresetTiersValidator,
  itemAspectRatio: v.number(),
  itemCount: v.number(),
  defaultItemImagePadding: v.union(v.number(), v.null()),
  // optional per-template override for cloned-board label visibility. when
  // unset, forked boards inherit the user's global showLabels preference
  labels: v.optional(boardLabelSettingsValidator),
  // per-template logo backdrop pinned at publish; absent -> On+Auto default
  autoPlate: v.optional(boardAutoPlateSettingsValidator),
  // image styles (skins); absent -> single-skin template
  styles: v.optional(v.array(seedTemplateStyleValidator)),
  defaultStyleId: v.optional(v.union(v.string(), v.null())),
})

export const seedItemUpsertValidator = v.object({
  itemExternalId: v.string(),
  order: v.number(),
  label: v.union(v.string(), v.null()),
  mediaDedupeHash: v.string(),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
  mediaPlate: mediaPlateNullableValidator,
  imagePadding: v.union(v.number(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
})

export const seedCriterionUpsertValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  criteriaContentHash: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  prompt: v.string(),
  axisTop: v.union(v.string(), v.null()),
  axisBottom: v.union(v.string(), v.null()),
  order: v.number(),
  isPrimary: v.boolean(),
  status: templateCriterionStatusValidator,
})

export const seedFinalizedMediaValidator = v.object({
  assetKey: v.string(),
  contentHashes: v.array(v.string()),
  mediaAssetId: v.string(),
  reused: v.boolean(),
})

export const seedRejectedUploadValidator = v.object({
  assetKey: v.string(),
  contentHash: v.string(),
  storageId: v.string(),
  reason: v.string(),
  cleaned: v.boolean(),
})

export const seedCompiledTotalsValidator = v.object({
  templateCount: v.number(),
  itemCount: v.number(),
  criterionCount: v.number(),
  sourceImageCount: v.number(),
  variantCount: v.number(),
  estimatedUploadBytes: v.number(),
  estimatedStorageBytes: v.number(),
})

export const seedDiagnosticValidator = v.object({
  code: v.string(),
  message: v.string(),
  path: v.string(),
  severity: v.union(v.literal('warning'), v.literal('error')),
})

export const seedTemplateUpsertOutputValidator = v.object({
  created: v.array(v.string()),
  updated: v.array(v.string()),
  unchanged: v.array(v.string()),
})

export const seedSyncTemplateItemsOutputValidator = v.object({
  created: v.array(seedTemplateItemKeyValidator),
  updated: v.array(seedTemplateItemKeyValidator),
  moved: v.array(seedTemplateItemKeyValidator),
  unchanged: v.array(seedTemplateItemKeyValidator),
  deleted: v.array(seedTemplateItemKeyValidator),
})

export const seedTemplateStyleItemKeyValidator = v.object({
  templateExternalId: v.string(),
  styleExternalId: v.string(),
  itemExternalId: v.string(),
})

export const seedTemplateStyleItemUpsertValidator = v.object({
  itemExternalId: v.string(),
  mediaDedupeHash: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
  mediaPlate: mediaPlateNullableValidator,
  imagePadding: v.union(v.number(), v.null()),
})

export const seedSyncTemplateStyleItemsOutputValidator = v.object({
  created: v.array(seedTemplateStyleItemKeyValidator),
  updated: v.array(seedTemplateStyleItemKeyValidator),
  unchanged: v.array(seedTemplateStyleItemKeyValidator),
  deleted: v.array(seedTemplateStyleItemKeyValidator),
})

export const seedCriterionUpsertOutputValidator = v.object({
  created: v.array(seedTemplateCriterionKeyValidator),
  updated: v.array(seedTemplateCriterionKeyValidator),
  unchanged: v.array(seedTemplateCriterionKeyValidator),
  deactivated: v.array(seedTemplateCriterionKeyValidator),
})

export const resolveStateArgsValidator = {
  datasetKey: v.string(),
  releaseId: v.string(),
  authorEmail: v.string(),
  templateExternalIds: v.array(v.string()),
  itemExternalIds: v.array(seedTemplateItemKeyValidator),
  criterionExternalIds: v.array(seedTemplateCriterionKeyValidator),
  variantHashes: v.array(v.string()),
}

export const resolveStateOutputValidator = v.object({
  activeReleaseId: v.union(v.string(), v.null()),
  templates: v.array(seedResolvedTemplateValidator),
  items: v.array(seedResolvedItemValidator),
  criteria: v.array(seedResolvedCriterionValidator),
  media: v.array(seedResolvedMediaValidator),
})
