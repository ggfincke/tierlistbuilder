// convex/lib/validators/common.ts
// cross-domain Convex validators shared by platform, workspace, & marketplace

import type { Infer, Validator } from 'convex/values'
import { v } from 'convex/values'
import { validateHexColor } from '../hexColor'
import {
  PALETTE_IDS,
  TEXT_STYLE_IDS,
  type PaletteId,
  type TextStyleId,
  type TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'
import {
  ITEM_IMAGE_SOURCES,
  LABEL_SCRIMS,
  LABEL_TEXT_COLORS,
  MEDIA_PLATES,
  type BoardAutoPlateSettings,
  type BoardLabelSettings,
  type ImageFit,
  type ItemImageSource,
  type ItemLabelOptions,
  type ItemTransform,
  type LabelPlacement,
  type LabelScrim,
  type LabelTextColor,
  type MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'

export type _Assert<T extends true> = T
export type _Exact<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false

export const literalUnion = <T extends readonly [string, ...string[]]>(
  values: T
): Validator<T[number]> =>
{
  const literals = values.map((value) => v.literal(value))
  if (literals.length === 1)
  {
    return literals[0] as unknown as Validator<T[number]>
  }
  return v.union(
    ...(literals as [
      Validator<string>,
      Validator<string>,
      ...Validator<string>[],
    ])
  ) as unknown as Validator<T[number]>
}

export const imageFitValidator = v.union(
  v.literal('cover'),
  v.literal('contain')
)
export const imageFitNullableValidator = v.union(imageFitValidator, v.null())

export const mediaPlateValidator = literalUnion(MEDIA_PLATES)
export const mediaPlateNullableValidator = v.union(
  mediaPlateValidator,
  v.null()
)

export const itemImageSourceValidator = literalUnion(ITEM_IMAGE_SOURCES)

export const tierColorSpecValidator = v.union(
  v.object({
    kind: v.literal('palette'),
    index: v.number(),
  }),
  v.object({
    kind: v.literal('custom'),
    hex: v.string(),
  })
)

export const paletteIdValidator = literalUnion(PALETTE_IDS)
export const textStyleIdValidator = literalUnion(TEXT_STYLE_IDS)

export const itemTransformValidator = v.object({
  rotation: v.union(
    v.literal(0),
    v.literal(90),
    v.literal(180),
    v.literal(270)
  ),
  zoom: v.number(),
  offsetX: v.number(),
  offsetY: v.number(),
})

export const tierPresetTierValidator = v.object({
  name: v.string(),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.optional(tierColorSpecValidator),
  description: v.optional(v.string()),
})

export const tierPresetTiersValidator = v.array(tierPresetTierValidator)

export const labelScrimValidator = literalUnion(LABEL_SCRIMS)
export const labelTextColorValidator = literalUnion(LABEL_TEXT_COLORS)

export const labelPlacementValidator = v.union(
  v.object({
    mode: v.literal('overlay'),
    x: v.number(),
    y: v.number(),
  }),
  v.object({ mode: v.literal('captionAbove') }),
  v.object({ mode: v.literal('captionBelow') })
)

export const itemLabelOptionsValidator = v.object({
  visible: v.optional(v.boolean()),
  placement: v.optional(labelPlacementValidator),
  scrim: v.optional(labelScrimValidator),
  fontSizePx: v.optional(v.number()),
  textStyleId: v.optional(textStyleIdValidator),
  textColor: v.optional(labelTextColorValidator),
})

export const boardLabelSettingsValidator = v.object({
  show: v.optional(v.boolean()),
  placement: v.optional(labelPlacementValidator),
  scrim: v.optional(labelScrimValidator),
  fontSizePx: v.optional(v.number()),
  textStyleId: v.optional(textStyleIdValidator),
  textColor: v.optional(labelTextColorValidator),
})

export const boardAutoPlateSettingsValidator = v.union(
  v.object({ mode: v.literal('off') }),
  v.object({ mode: v.literal('auto') }),
  v.object({
    mode: v.literal('uniform'),
    uniformColor: v.optional(v.string()),
  })
)

export const optionalItemRenderFields = {
  imageFit: v.optional(imageFitValidator),
  imagePadding: v.optional(v.number()),
  backgroundColor: v.optional(v.string()),
  mediaPlate: v.optional(mediaPlateValidator),
  transform: v.optional(itemTransformValidator),
  aspectRatio: v.optional(v.number()),
}

// per-(style,item) image-override render fields; mirrors templateItems' item
// render fields so a non-default style's asset row can't drift from the default
export const styleItemRenderFields = {
  mediaPlate: v.optional(mediaPlateNullableValidator),
  altText: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
}

export const validateBoardAutoPlateUniformColor = (
  autoPlate: BoardAutoPlateSettings | undefined | null
): void =>
{
  if (autoPlate?.mode !== 'uniform' || autoPlate.uniformColor === undefined)
  {
    return
  }
  validateHexColor(autoPlate.uniformColor, 'autoPlate.uniformColor')
}

export type _ImageFitExact = _Assert<
  _Exact<ImageFit, Infer<typeof imageFitValidator>>
>
export type _MediaPlateExact = _Assert<
  _Exact<MediaPlate, Infer<typeof mediaPlateValidator>>
>
export type _ItemImageSourceExact = _Assert<
  _Exact<ItemImageSource, Infer<typeof itemImageSourceValidator>>
>
export type _TierColorSpecExact = _Assert<
  _Exact<TierColorSpec, Infer<typeof tierColorSpecValidator>>
>
export type _PaletteIdExact = _Assert<
  _Exact<PaletteId, Infer<typeof paletteIdValidator>>
>
export type _TextStyleIdExact = _Assert<
  _Exact<TextStyleId, Infer<typeof textStyleIdValidator>>
>
export type _ItemTransformExact = _Assert<
  _Exact<ItemTransform, Infer<typeof itemTransformValidator>>
>
export type _TierPresetTierExact = _Assert<
  _Exact<TierPresetTier, Infer<typeof tierPresetTierValidator>>
>
export type _LabelPlacementExact = _Assert<
  _Exact<LabelPlacement, Infer<typeof labelPlacementValidator>>
>
export type _LabelScrimExact = _Assert<
  _Exact<LabelScrim, Infer<typeof labelScrimValidator>>
>
export type _LabelTextColorExact = _Assert<
  _Exact<LabelTextColor, Infer<typeof labelTextColorValidator>>
>
export type _ItemLabelOptionsExact = _Assert<
  _Exact<ItemLabelOptions, Infer<typeof itemLabelOptionsValidator>>
>
export type _BoardLabelSettingsExact = _Assert<
  _Exact<BoardLabelSettings, Infer<typeof boardLabelSettingsValidator>>
>
export type _BoardAutoPlateSettingsExact = _Assert<
  _Exact<BoardAutoPlateSettings, Infer<typeof boardAutoPlateSettingsValidator>>
>
