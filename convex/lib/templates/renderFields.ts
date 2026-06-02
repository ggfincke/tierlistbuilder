// convex/lib/templates/renderFields.ts
// template render-field mappers shared by board, ranking, & sync writers

import type { Doc } from '../../_generated/dataModel'
import type {
  BoardAutoPlateSettings,
  BoardLabelSettings,
  ImageFit,
  ItemAspectRatioMode,
} from '@tierlistbuilder/contracts/workspace/board'

type RenderFieldKey =
  | 'itemAspectRatio'
  | 'itemAspectRatioMode'
  | 'defaultItemImageFit'
  | 'defaultItemImagePadding'
  | 'labels'
  | 'autoPlate'

export const BOARD_RENDER_FIELDS = [
  'itemAspectRatio',
  'itemAspectRatioMode',
  'defaultItemImageFit',
  'defaultItemImagePadding',
  'labels',
  'autoPlate',
] as const satisfies readonly RenderFieldKey[]

type RenderSource = Pick<
  Doc<'templates'> | Doc<'templateStyles'>,
  RenderFieldKey
>

export interface BoardRenderDbFields
{
  itemAspectRatio: number | null
  itemAspectRatioMode: ItemAspectRatioMode | null
  defaultItemImageFit: ImageFit | null
  defaultItemImagePadding: number | null
  labels: BoardLabelSettings | null
  autoPlate?: BoardAutoPlateSettings
}

export interface BoardRenderWireFields
{
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  defaultItemImageFit?: ImageFit
  defaultItemImagePadding?: number
  labels?: BoardLabelSettings
  autoPlate?: BoardAutoPlateSettings
}

type BoardRenderStoredFields = Omit<
  BoardRenderDbFields,
  'defaultItemImagePadding'
> & {
  defaultItemImagePadding?: number | null
}

export const buildRenderSourceFields = (
  renderSource: RenderSource | null | undefined
): BoardRenderDbFields => ({
  itemAspectRatio: renderSource?.itemAspectRatio ?? null,
  itemAspectRatioMode: renderSource?.itemAspectRatioMode ?? null,
  defaultItemImageFit: renderSource?.defaultItemImageFit ?? null,
  defaultItemImagePadding: renderSource?.defaultItemImagePadding ?? null,
  labels: renderSource?.labels ?? null,
  autoPlate: renderSource?.autoPlate,
})

export const renderFieldsFromTemplate = (
  renderSource: RenderSource | null | undefined
): BoardRenderDbFields => buildRenderSourceFields(renderSource)

export const renderFieldsFromArgs = (
  args: Partial<BoardRenderDbFields>
): BoardRenderDbFields => ({
  itemAspectRatio: args.itemAspectRatio ?? null,
  itemAspectRatioMode: args.itemAspectRatioMode ?? null,
  defaultItemImageFit: args.defaultItemImageFit ?? null,
  defaultItemImagePadding: args.defaultItemImagePadding ?? null,
  labels: args.labels ?? null,
  autoPlate: args.autoPlate,
})

export const renderFieldsToWire = (
  board: BoardRenderStoredFields
): BoardRenderWireFields => ({
  itemAspectRatio: board.itemAspectRatio ?? undefined,
  itemAspectRatioMode: board.itemAspectRatioMode ?? undefined,
  defaultItemImageFit: board.defaultItemImageFit ?? undefined,
  defaultItemImagePadding: board.defaultItemImagePadding ?? undefined,
  labels: board.labels ?? undefined,
  autoPlate: board.autoPlate ?? undefined,
})
