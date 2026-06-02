// src/shared/board-data/boardNormalizers.ts
// shared validation helpers for snapshot & wire payload paths

import type {
  AutoPlateMode,
  BoardAutoPlateSettings,
  BoardLabelSettings,
  ImageFit,
  ItemAspectRatioMode,
  ItemLabelOptions,
  ItemRotation,
  TierItem,
  ItemTransform,
  LabelPlacement,
  LabelScrim,
  LabelTextColor,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  AUTO_PLATE_MODES,
  ITEM_IMAGE_SOURCES,
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
  LABEL_SCRIMS,
  LABEL_TEXT_COLORS,
  MEDIA_PLATES,
  normalizeImagePadding,
  normalizeLabelFontSizePx,
} from '@tierlistbuilder/contracts/workspace/board'
import { TEXT_STYLE_IDS } from '@tierlistbuilder/contracts/lib/theme'
import { isHexColor } from '@tierlistbuilder/contracts/lib/hexColor'
import { asNonEmptyString, isRecord } from '~/shared/lib/typeGuards'

export const ASPECT_RATIO_MODES: readonly ItemAspectRatioMode[] = [
  'auto',
  'manual',
]
export const IMAGE_FITS: readonly ImageFit[] = ['cover', 'contain']
const ROTATION_VALUES: readonly ItemRotation[] = [0, 90, 180, 270]

export const normalizePositiveFinite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined

export const normalizeEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined)

const clampFiniteNumber = (
  value: unknown,
  min: number,
  max: number
): number | null =>
{
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < min) return min
  if (value > max) return max
  return value
}

// validate untrusted placement payloads. unknown modes & out-of-range
// coordinates collapse to undefined so the renderer falls back to defaults
const normalizeLabelPlacement = (raw: unknown): LabelPlacement | undefined =>
{
  if (!isRecord(raw)) return undefined
  const mode = raw.mode
  if (mode === 'overlay')
  {
    const x = clampFiniteNumber(raw.x, 0, 1)
    const y = clampFiniteNumber(raw.y, 0, 1)
    if (x === null || y === null) return undefined
    return { mode: 'overlay', x, y }
  }
  if (mode === 'captionAbove') return { mode: 'captionAbove' }
  if (mode === 'captionBelow') return { mode: 'captionBelow' }
  return undefined
}

type LabelOptionResult = BoardLabelSettings | ItemLabelOptions

const assignNormalizedLabelFields = (
  result: LabelOptionResult,
  raw: Record<string, unknown>,
  options: { allowAutoTextColor: boolean }
): void =>
{
  const placement = normalizeLabelPlacement(raw.placement)
  if (placement) result.placement = placement
  const scrim = normalizeEnum<LabelScrim>(raw.scrim, LABEL_SCRIMS)
  if (scrim) result.scrim = scrim
  const fontSizePx = normalizeLabelFontSizePx(raw.fontSizePx)
  if (fontSizePx !== undefined) result.fontSizePx = fontSizePx
  const textStyleId = normalizeEnum(raw.textStyleId, TEXT_STYLE_IDS)
  if (textStyleId) result.textStyleId = textStyleId
  const textColor = normalizeEnum<LabelTextColor>(
    raw.textColor,
    LABEL_TEXT_COLORS
  )
  if (textColor && (options.allowAutoTextColor || textColor !== 'auto'))
  {
    result.textColor = textColor
  }
}

const normalizeItemLabelOptions = (
  raw: unknown
): ItemLabelOptions | undefined =>
{
  if (!isRecord(raw)) return undefined
  const result: ItemLabelOptions = {}
  if (typeof raw.visible === 'boolean') result.visible = raw.visible
  assignNormalizedLabelFields(result, raw, { allowAutoTextColor: true })
  return Object.keys(result).length > 0 ? result : undefined
}

export const normalizeBoardLabelSettings = (
  raw: unknown
): BoardLabelSettings | undefined =>
{
  if (!isRecord(raw)) return undefined
  const result: BoardLabelSettings = {}
  if (typeof raw.show === 'boolean') result.show = raw.show
  assignNormalizedLabelFields(result, raw, { allowAutoTextColor: false })
  return Object.keys(result).length > 0 ? result : undefined
}

// validate untrusted auto-plate settings — an unknown mode drops the whole
// object (absent -> On+Auto default); uniformColor only survives uniform mode
// & must be a hex string
export const normalizeBoardAutoPlate = (
  raw: unknown
): BoardAutoPlateSettings | undefined =>
{
  if (!isRecord(raw)) return undefined
  const mode = normalizeEnum<AutoPlateMode>(raw.mode, AUTO_PLATE_MODES)
  if (!mode) return undefined
  const uniformColor =
    mode === 'uniform' &&
    typeof raw.uniformColor === 'string' &&
    isHexColor(raw.uniformColor)
      ? raw.uniformColor
      : undefined
  return uniformColor ? { mode, uniformColor } : { mode }
}

// validate & clamp untrusted transform input. returns undefined for missing
// or malformed payloads so a "no manual edit" item roundtrips w/o a phantom
// transform that defeats the imageFit path
const normalizeItemTransform = (raw: unknown): ItemTransform | undefined =>
{
  if (!isRecord(raw)) return undefined
  const rotation = raw.rotation
  if (
    typeof rotation !== 'number' ||
    !ROTATION_VALUES.includes(rotation as ItemRotation)
  )
  {
    return undefined
  }
  const zoom = clampFiniteNumber(
    raw.zoom,
    ITEM_TRANSFORM_LIMITS.zoomMin,
    ITEM_TRANSFORM_LIMITS.zoomMax
  )
  if (zoom === null) return undefined
  const offsetX = clampFiniteNumber(
    raw.offsetX,
    ITEM_TRANSFORM_LIMITS.offsetMin,
    ITEM_TRANSFORM_LIMITS.offsetMax
  )
  if (offsetX === null) return undefined
  const offsetY = clampFiniteNumber(
    raw.offsetY,
    ITEM_TRANSFORM_LIMITS.offsetMin,
    ITEM_TRANSFORM_LIMITS.offsetMax
  )
  if (offsetY === null) return undefined
  const normalized = {
    rotation: rotation as ItemRotation,
    zoom,
    offsetX,
    offsetY,
  }
  return normalized.rotation === ITEM_TRANSFORM_IDENTITY.rotation &&
    normalized.zoom === ITEM_TRANSFORM_IDENTITY.zoom &&
    normalized.offsetX === ITEM_TRANSFORM_IDENTITY.offsetX &&
    normalized.offsetY === ITEM_TRANSFORM_IDENTITY.offsetY
    ? undefined
    : normalized
}

interface AssignNormalizedItemScalarsOptions
{
  aspectRatioFallback?: number
}

export const assignNormalizedItemScalars = (
  item: TierItem,
  raw: unknown,
  options: AssignNormalizedItemScalarsOptions = {}
): void =>
{
  if (!isRecord(raw)) return

  const aspectRatio =
    normalizePositiveFinite(raw.aspectRatio) ?? options.aspectRatioFallback
  const imageFit = normalizeEnum(raw.imageFit, IMAGE_FITS)
  const mediaPlate = normalizeEnum(raw.mediaPlate, MEDIA_PLATES)
  const transform = normalizeItemTransform(raw.transform)
  const imagePadding = normalizeImagePadding(raw.imagePadding)
  const labelOptions = normalizeItemLabelOptions(raw.labelOptions)

  if (typeof raw.label === 'string') item.label = raw.label
  if (
    typeof raw.backgroundColor === 'string' &&
    isHexColor(raw.backgroundColor)
  )
  {
    item.backgroundColor = raw.backgroundColor
  }
  if (mediaPlate !== undefined) item.mediaPlate = mediaPlate
  if (typeof raw.altText === 'string') item.altText = raw.altText
  if (typeof raw.notes === 'string') item.notes = raw.notes
  if (aspectRatio !== undefined) item.aspectRatio = aspectRatio
  if (imageFit !== undefined) item.imageFit = imageFit
  if (transform !== undefined) item.transform = transform
  if (imagePadding !== undefined) item.imagePadding = imagePadding
  if (labelOptions !== undefined) item.labelOptions = labelOptions
  const sourceTemplateItemExternalId = asNonEmptyString(
    raw.sourceTemplateItemExternalId
  )
  if (sourceTemplateItemExternalId !== undefined)
  {
    item.sourceTemplateItemExternalId = sourceTemplateItemExternalId
  }
  const imageSource = normalizeEnum(raw.imageSource, ITEM_IMAGE_SOURCES)
  if (imageSource !== undefined) item.imageSource = imageSource
}
