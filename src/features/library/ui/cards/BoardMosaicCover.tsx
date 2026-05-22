// src/features/library/ui/cards/BoardMosaicCover.tsx
// cover artwork for board cards & list-row thumbs — an initials/image mosaic
// over the media matte, or a giant ghost-letter for empty boards

import type { LibraryBoardCoverItem } from '@tierlistbuilder/contracts/workspace/board'
import type {
  TemplateCoverFraming,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

import { externalIdToCode } from '~/shared/lib/initials'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import { FramedCoverImage } from '~/shared/board-ui/FramedCoverImage'

type CoverDensity = 'dense' | 'default' | 'loose'

interface BoardMosaicCoverProps
{
  items: readonly LibraryBoardCoverItem[]
  density: CoverDensity
  sourceCoverMedia?: TemplateMediaRef | null
  sourceCoverFraming?: TemplateCoverFraming | null
  // board title — drives the ghost-letter initial on draft/empty covers
  title: string
}

const GRID_CONFIG: Record<
  CoverDensity,
  { cols: number; rows: number; gap: number; padPx: number }
> = {
  dense: { cols: 6, rows: 4, gap: 2, padPx: 4 },
  default: { cols: 5, rows: 3, gap: 3, padPx: 6 },
  loose: { cols: 4, rows: 2, gap: 4, padPx: 8 },
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

const CoverTileFrame = ({
  item,
  mediaUrl,
}: {
  item: LibraryBoardCoverItem
  mediaUrl: string | null
}) => (
  <div className="relative flex items-center justify-center overflow-hidden rounded-[3px] bg-black/25 ring-1 ring-inset ring-white/10">
    {mediaUrl ? (
      <img
        src={mediaUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    ) : (
      <span className="truncate px-1 text-[10px] font-semibold leading-tight text-white/90 drop-shadow-sm">
        {resolveTileText(item)}
      </span>
    )}
  </div>
)

// only mounted when we need to wait on the blob cache — cloud-resolved rows
// (item.mediaUrl already set) & rows w/o media skip the subscription
const CachedCoverTile = ({ item }: { item: LibraryBoardCoverItem }) =>
{
  const cachedUrl = useImageUrl(
    item.mediaHash,
    item.mediaCloudExternalId,
    item.mediaVariant
  )
  return <CoverTileFrame item={item} mediaUrl={cachedUrl} />
}

const CoverTile = ({ item }: { item: LibraryBoardCoverItem }) =>
{
  if (item.mediaUrl)
  {
    return <CoverTileFrame item={item} mediaUrl={item.mediaUrl} />
  }
  if (item.mediaHash)
  {
    return <CachedCoverTile item={item} />
  }
  return <CoverTileFrame item={item} mediaUrl={null} />
}

export const BoardMosaicCover = ({
  items,
  density,
  sourceCoverMedia,
  sourceCoverFraming,
  title,
}: BoardMosaicCoverProps) =>
{
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

  const cfg = GRID_CONFIG[density]
  const slotCount = cfg.cols * cfg.rows
  const tiles = items.slice(0, slotCount)

  return (
    <div
      className="absolute inset-0 grid bg-[var(--t-media-matte)]"
      style={{
        gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`,
        gridTemplateRows: `repeat(${cfg.rows}, 1fr)`,
        gap: `${cfg.gap}px`,
        padding: `${cfg.padPx}px`,
      }}
      aria-hidden="true"
    >
      {tiles.map((item, i) => (
        <CoverTile key={`${item.externalId}-${i}`} item={item} />
      ))}
    </div>
  )
}
