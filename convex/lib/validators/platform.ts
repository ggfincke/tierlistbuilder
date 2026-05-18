// convex/lib/validators/platform.ts
// platform preferences, media, user, & short-link validators

import type { Infer } from 'convex/values'
import { v } from 'convex/values'
import {
  ITEM_SHAPES,
  ITEM_SIZES,
  LABEL_WIDTHS,
  TIER_LABEL_FONT_SIZES,
  TOOLBAR_POSITIONS,
  type AppPreferences,
  type CloudPreferencesRead,
} from '@tierlistbuilder/contracts/platform/preferences'
import {
  MEDIA_VARIANT_KINDS,
  SUPPORTED_IMAGE_MIME_TYPES,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import {
  USER_PLANS,
  type UserPlan,
} from '@tierlistbuilder/contracts/platform/user'
import {
  LABEL_PLACEMENT_MODES,
  type LabelPlacementMode,
} from '@tierlistbuilder/contracts/workspace/board'
import { THEME_IDS, type ThemeId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  OwnedShortLinkListItem,
  ShortLinkResolveResult,
} from '@tierlistbuilder/contracts/platform/shortLink'
import {
  type _Assert,
  type _Exact,
  literalUnion,
  paletteIdValidator,
  textStyleIdValidator,
} from './common'

const themeIdValidator = literalUnion(THEME_IDS)
const itemSizeValidator = literalUnion(ITEM_SIZES)
const itemShapeValidator = literalUnion(ITEM_SHAPES)
const labelWidthValidator = literalUnion(LABEL_WIDTHS)
const tierLabelFontSizeValidator = literalUnion(TIER_LABEL_FONT_SIZES)
const toolbarPositionValidator = literalUnion(TOOLBAR_POSITIONS)
const labelPlacementModeValidator = literalUnion(LABEL_PLACEMENT_MODES)

export const userPlanValidator = literalUnion(USER_PLANS)
export const mediaVariantKindValidator = literalUnion(MEDIA_VARIANT_KINDS)
export const imageMimeTypeValidator = literalUnion(SUPPORTED_IMAGE_MIME_TYPES)

export const mediaVariantSummaryValidator = v.object({
  storageId: v.id('_storage'),
  width: v.number(),
  height: v.number(),
  byteSize: v.number(),
  mimeType: v.string(),
  contentHash: v.string(),
})

export const appPreferencesValidator = v.object({
  itemSize: itemSizeValidator,
  showLabels: v.boolean(),
  defaultLabelPlacementMode: labelPlacementModeValidator,
  defaultLabelFontSizePx: v.number(),
  itemShape: itemShapeValidator,
  compactMode: v.boolean(),
  exportBackgroundOverride: v.union(v.string(), v.null()),
  exportItemsPerRow: v.number(),
  boardBackgroundOverride: v.union(v.string(), v.null()),
  labelWidth: labelWidthValidator,
  hideRowControls: v.boolean(),
  confirmBeforeDelete: v.boolean(),
  themeId: themeIdValidator,
  paletteId: paletteIdValidator,
  textStyleId: textStyleIdValidator,
  tierLabelBold: v.boolean(),
  tierLabelItalic: v.boolean(),
  tierLabelFontSize: tierLabelFontSizeValidator,
  boardLocked: v.boolean(),
  topNavLocked: v.boolean(),
  reducedMotion: v.boolean(),
  toolbarPosition: toolbarPositionValidator,
  showItemEditButton: v.boolean(),
  autoCropTrimSoftShadows: v.boolean(),
})

export const cloudPreferencesReadValidator = v.object({
  preferences: appPreferencesValidator,
  updatedAt: v.number(),
})

export const shortLinkResolveResultValidator = v.union(
  v.object({ kind: v.literal('not-found') }),
  v.object({
    kind: v.literal('snapshot'),
    snapshotUrl: v.string(),
    createdAt: v.number(),
  })
)

export const ownedShortLinkListItemValidator = v.object({
  slug: v.string(),
  boardTitle: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
})

export type _ThemeIdExact = _Assert<
  _Exact<ThemeId, Infer<typeof themeIdValidator>>
>
export type _LabelPlacementModeExact = _Assert<
  _Exact<LabelPlacementMode, Infer<typeof labelPlacementModeValidator>>
>
export type _UserPlanExact = _Assert<
  _Exact<UserPlan, Infer<typeof userPlanValidator>>
>
export type _AppPreferencesExact = _Assert<
  _Exact<AppPreferences, Infer<typeof appPreferencesValidator>>
>
export type _CloudPreferencesReadExact = _Assert<
  _Exact<CloudPreferencesRead, Infer<typeof cloudPreferencesReadValidator>>
>
export type _MediaVariantKindExact = _Assert<
  _Exact<MediaVariantKind, Infer<typeof mediaVariantKindValidator>>
>
export type _SupportedImageMimeTypeExact = _Assert<
  _Exact<SupportedImageMimeType, Infer<typeof imageMimeTypeValidator>>
>
export type _ShortLinkResolveResultExact = _Assert<
  _Exact<ShortLinkResolveResult, Infer<typeof shortLinkResolveResultValidator>>
>
export type _OwnedShortLinkListItemExact = _Assert<
  _Exact<OwnedShortLinkListItem, Infer<typeof ownedShortLinkListItemValidator>>
>
