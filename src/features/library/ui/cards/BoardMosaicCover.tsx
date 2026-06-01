// src/features/library/ui/cards/BoardMosaicCover.tsx
// cover artwork for board cards & list-row thumbs — a media mosaic that fills
// edge-to-edge (plated items float, art fills), or a ghost-letter for empties

import type {
  BoardAutoPlateSettings,
  ImageFit,
  LibraryBoardCoverItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  TemplateCoverFraming,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { ShowcaseMiniSnapshot } from '@tierlistbuilder/contracts/social/showcase'

import { externalIdToCode } from '~/shared/lib/initials'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import { FramedCoverImage } from '~/shared/board-ui/FramedCoverImage'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'
import { MosaicGrid } from '~/shared/board-ui/MosaicGrid'
import { ShowcaseMiniTierRows } from '~/shared/board-ui/ShowcaseTileContent'
import { resolveCoverTileRender } from '~/shared/board-ui/coverTileRender'

type CoverDensity = 'dense' | 'default' | 'loose'

// board-level render context — mirrors the board's own item-render settings so
// cover tiles resolve plates / fit the same way the board does
interface CoverRenderContext
{
  autoPlate?: BoardAutoPlateSettings | null
  defaultItemImageFit?: ImageFit | null
  defaultItemImagePadding?: number | null
}

interface BoardMosaicCoverProps extends CoverRenderContext
{
  items: readonly LibraryBoardCoverItem[]
  // live mini tier-list render; non-null only on live boards, takes the cover
  mini?: ShowcaseMiniSnapshot | null
  density: CoverDensity
  // board slot aspect (w/h); steers the grid so cells render near it
  itemAspectRatio?: number | null
  sourceCoverMedia?: TemplateMediaRef | null
  sourceCoverFraming?: TemplateCoverFraming | null
  // board title — drives the ghost-letter initial on draft/empty covers
  title: string
}

// per-density tile cap; the grid downsamples larger rosters to fit. `default`
// matches the marketplace card's `default` density so the covers render alike
const MAX_SLOTS: Record<CoverDensity, number> = {
  dense: 24,
  default: 18,
  loose: 12,
}

const resolveTileText = (item: LibraryBoardCoverItem): string =>
{
  const label = item.label?.trim()
  if (label) return label
  return externalIdToCode(item.externalId)
}

// first visible character of the title, uppercased — the editorial ghost
// glyph for boards w/o cover art; falls back to a tilde when the title is blank
const ghostInitial = (title: string): string =>
{
  const trimmed = title.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '~'
}

const GhostLetterCover = ({ title }: { title: string }) => (
  <div
    className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--t-media-matte)]"
    aria-hidden="true"
  >
    <span
      className="select-none font-black leading-none text-[var(--t-text)] opacity-[0.12]"
      style={{ fontSize: '8rem', letterSpacing: '-0.05em' }}
    >
      {ghostInitial(title)}
    </span>
  </div>
)

// label/code fallback for items w/o bound media (drafts, missing assets)
const TextTile = ({ item }: { item: LibraryBoardCoverItem }) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--t-media-matte)]">
    <span className="truncate px-1 text-[10px] font-semibold leading-tight text-white/90 drop-shadow-sm">
      {resolveTileText(item)}
    </span>
  </div>
)

// image tile mirroring the board's per-item render: a plate floats the image
// (logos -> contain, never cropped), everything else fills (cover)
const ImageTile = ({
  item,
  url,
  ctx,
}: {
  item: LibraryBoardCoverItem
  url: string
  ctx: CoverRenderContext
}) =>
{
  const { fit, padding, backgroundColor } = resolveCoverTileRender(item, {
    autoPlate: ctx.autoPlate,
    defaultImageFit: ctx.defaultItemImageFit,
    defaultImagePadding: ctx.defaultItemImagePadding,
  })
  return (
    <FramedItemMedia
      className="bg-[var(--t-media-matte)]"
      imageUrl={url}
      alt=""
      fit={fit}
      transform={item.transform ?? null}
      aspectRatio={item.aspectRatio}
      padding={padding}
      backgroundColor={backgroundColor}
    />
  )
}

// only mounted when we need to wait on the blob cache — cloud-resolved rows
// (item.mediaUrl already set) & rows w/o media skip the subscription
const CachedImageTile = ({
  item,
  ctx,
}: {
  item: LibraryBoardCoverItem
  ctx: CoverRenderContext
}) =>
{
  const cachedUrl = useImageUrl(
    item.mediaHash,
    item.mediaCloudExternalId,
    item.mediaVariant
  )
  if (!cachedUrl) return <TextTile item={item} />
  return <ImageTile item={item} url={cachedUrl} ctx={ctx} />
}

const CoverTile = ({
  item,
  ctx,
}: {
  item: LibraryBoardCoverItem
  ctx: CoverRenderContext
}) =>
{
  if (item.mediaUrl)
  {
    return <ImageTile item={item} url={item.mediaUrl} ctx={ctx} />
  }
  if (item.mediaHash)
  {
    return <CachedImageTile item={item} ctx={ctx} />
  }
  return <TextTile item={item} />
}

export const BoardMosaicCover = ({
  items,
  mini,
  density,
  itemAspectRatio,
  sourceCoverMedia,
  sourceCoverFraming,
  title,
  autoPlate,
  defaultItemImageFit,
  defaultItemImagePadding,
}: BoardMosaicCoverProps) =>
{
  // live boards render the same labeled mini tier-list the tlotl cropped tile
  // uses (full tier names in the gutter), filling the cover edge-to-edge &
  // clipped, w/o a caption — the board title lives in the card body below
  if (mini && mini.tiers.length > 0)
  {
    return (
      <div className="absolute inset-0 flex overflow-hidden">
        <ShowcaseMiniTierRows mini={mini} labelMode="name" />
      </div>
    )
  }

  if (sourceCoverMedia)
  {
    return (
      <FramedCoverImage
        src={sourceCoverMedia.url}
        alt=""
        sourceWidth={sourceCoverMedia.width}
        sourceHeight={sourceCoverMedia.height}
        frame={sourceCoverFraming?.card ?? null}
      />
    )
  }

  if (items.length === 0)
  {
    return <GhostLetterCover title={title} />
  }

  const ctx: CoverRenderContext = {
    autoPlate,
    defaultItemImageFit,
    defaultItemImagePadding,
  }
  return (
    <MosaicGrid
      items={items}
      maxSlots={MAX_SLOTS[density]}
      cellAspect={itemAspectRatio ?? 1}
      renderTile={(item, i) => (
        <CoverTile key={`${item.externalId}-${i}`} item={item} ctx={ctx} />
      )}
    />
  )
}
