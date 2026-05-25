// src/shared/board-ui/ShowcaseTileContent.tsx
// one tlotl showcase tile — a ranking's source-template cover, a mini live
// tier-list, or a title fallback. title overlays the bottom of the tile

import type {
  ShowcaseMiniSnapshot,
  ShowcaseRankingTile,
  ShowcaseTileMode,
} from '@tierlistbuilder/contracts/platform/showcase'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'

interface ShowcaseTileContentProps
{
  // null when the lane's tile isn't in the active render context
  tile: ShowcaseRankingTile | null
  tileMode: ShowcaseTileMode
  title: string
  frameAspectRatio?: number
  imageLoading?: 'eager' | 'lazy'
}

// mini-tier palette colorSpecs resolve against this; custom-hex specs ignore it
const MINI_PALETTE = 'classic'

const coverAspectRatio = (
  cover: NonNullable<ShowcaseRankingTile['cover']>
): number | null => (cover.height > 0 ? cover.width / cover.height : null)

const ShowcaseMiniBoard = ({ mini }: { mini: ShowcaseMiniSnapshot }) => (
  <div className="flex h-full w-full flex-col gap-px bg-[var(--t-border)]">
    {mini.tiers.map((tier, tierIndex) => (
      <div
        key={tierIndex}
        className="flex min-h-0 flex-1 items-center gap-px overflow-hidden"
        style={{
          backgroundColor: resolveTierColorSpec(MINI_PALETTE, tier.colorSpec),
        }}
      >
        {tier.items.map((item, itemIndex) =>
          item.media ? (
            <img
              key={itemIndex}
              src={item.media.url}
              alt=""
              loading="lazy"
              className="h-full w-auto min-w-0 object-cover"
            />
          ) : null
        )}
      </div>
    ))}
  </div>
)

const ShowcaseTileTitle = ({ title }: { title: string }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgb(var(--t-overlay)/0.85)] to-transparent px-1.5 pb-1 pt-4">
    <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white">
      {title}
    </span>
  </div>
)

const ShowcaseTileFallback = ({ title }: { title: string }) => (
  <div className="flex h-full w-full items-center justify-center bg-[var(--t-bg-surface)] p-1.5">
    <span className="line-clamp-3 text-center text-xs font-semibold text-[var(--t-text)]">
      {title}
    </span>
  </div>
)

export const ShowcaseTileContent = ({
  tile,
  tileMode,
  title,
  frameAspectRatio = 1,
  imageLoading = 'lazy',
}: ShowcaseTileContentProps) =>
{
  const mini =
    tileMode === 'mini' && tile?.mini && tile.mini.tiers.length > 0
      ? tile.mini
      : null
  const cover = tile?.cover ?? null

  // mini-less rankings fall back to cover even in 'mini' mode; no media at all
  // -> title fallback
  if (!mini && !cover)
  {
    return <ShowcaseTileFallback title={title} />
  }

  const media = mini ? (
    <ShowcaseMiniBoard mini={mini} />
  ) : cover ? (
    <FramedItemMedia
      imageUrl={cover.url}
      alt={title}
      fit="cover"
      transform={null}
      aspectRatio={coverAspectRatio(cover)}
      frameAspectRatio={frameAspectRatio}
      padding={0}
      backgroundColor={null}
      loading={imageLoading}
    />
  ) : null

  return (
    <div className="relative h-full w-full overflow-hidden">
      {media}
      <ShowcaseTileTitle title={title} />
    </div>
  )
}
