// src/features/library/components/Cover.tsx
// cover artwork for board cards & list-row thumbs — draft pattern, initials
// mosaic over media matte, or bare matte; fills `absolute inset-0` of parent

import type { LibraryBoardCoverItem } from '@tierlistbuilder/contracts/workspace/board'

export type CoverDensity = 'dense' | 'default' | 'loose'

interface CoverProps
{
  items: readonly LibraryBoardCoverItem[]
  density: CoverDensity
  // 'draft' independent of items.length so configured-but-empty boards still
  // render the draft pattern instead of a bare matte
  isDraft: boolean
  // override for the draft caption; defaults to "Empty draft"
  emptyLabel?: string
}

const GRID_CONFIG: Record<
  CoverDensity,
  { cols: number; rows: number; gap: number; padPx: number }
> = {
  dense: { cols: 6, rows: 4, gap: 2, padPx: 4 },
  default: { cols: 5, rows: 3, gap: 3, padPx: 6 },
  loose: { cols: 4, rows: 2, gap: 4, padPx: 8 },
}

// stable 1-2 char fallback when label is missing
const externalIdToCode = (externalId: string): string =>
{
  const cleaned = externalId.replace(/[^A-Za-z0-9]+/g, '')
  return cleaned.slice(0, 2).toUpperCase() || '··'
}

const resolveTileText = (item: LibraryBoardCoverItem): string =>
{
  const label = item.label?.trim()
  if (label) return label
  return externalIdToCode(item.externalId)
}

const DraftPattern = ({ caption }: { caption: string }) => (
  <div
    className="absolute inset-0 flex items-center justify-center bg-[var(--t-media-matte)]"
    style={{
      backgroundImage: `
        linear-gradient(45deg, rgb(var(--t-overlay) / 0.04) 25%, transparent 25%),
        linear-gradient(-45deg, rgb(var(--t-overlay) / 0.04) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgb(var(--t-overlay) / 0.04) 75%),
        linear-gradient(-45deg, transparent 75%, rgb(var(--t-overlay) / 0.04) 75%)
      `,
      backgroundSize: '14px 14px',
      backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0',
    }}
    aria-hidden="true"
  >
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgb(var(--t-overlay)/0.45)]">
      {caption}
    </span>
  </div>
)

export const Cover = ({
  items,
  density,
  isDraft,
  emptyLabel = 'Empty draft',
}: CoverProps) =>
{
  if (isDraft || items.length === 0)
  {
    return <DraftPattern caption={emptyLabel} />
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
        <div
          key={`${item.externalId}-${i}`}
          className="relative flex items-center justify-center overflow-hidden rounded-[3px] bg-black/25 ring-1 ring-inset ring-white/10"
        >
          {item.mediaUrl ? (
            <img
              src={item.mediaUrl}
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
      ))}
    </div>
  )
}
