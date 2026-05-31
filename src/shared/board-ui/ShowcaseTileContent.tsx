// src/shared/board-ui/ShowcaseTileContent.tsx
// one tlotl showcase tile by active mode: cover, full mini, or profile card

import type { ReactNode } from 'react'
import type { MarketplaceItemRenderFields } from '@tierlistbuilder/contracts/marketplace/template'
import type {
  ShowcaseMiniSnapshot,
  ShowcaseMiniTier,
  ShowcaseRankingTile,
  ShowcaseTileMode,
} from '@tierlistbuilder/contracts/platform/showcase'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { getTextColor } from '~/shared/lib/color'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'
import { resolveItemBackdrop } from '~/shared/board-ui/mediaPlate'

interface ShowcaseTileContentProps
{
  // null when the lane's tile isn't in the active render context
  tile: ShowcaseRankingTile | null
  tileMode: ShowcaseTileMode
  title: string
  frameAspectRatio?: number
  imageLoading?: 'eager' | 'lazy'
}

interface MiniCardProps
{
  mini: ShowcaseMiniSnapshot
  title: string
}

// mini-tier palette colorSpecs resolve against this; custom-hex specs ignore it
const MINI_PALETTE = 'classic'

const coverAspectRatio = (
  cover: NonNullable<ShowcaseRankingTile['cover']>
): number | null => (cover.height > 0 ? cover.width / cover.height : null)

const tierColor = (tier: ShowcaseMiniTier): string =>
  resolveTierColorSpec(MINI_PALETTE, tier.colorSpec)

// first grapheme of the tier name, uppercased — the compact tier-list label
const tierInitial = (tier: ShowcaseMiniTier): string =>
  [...tier.name.trim()][0]?.toUpperCase() ?? '·'

// one plated thumbnail — natural width at the row height, plate inset only when
// the item carries a backdrop. shared by every mini/card thumbnail strip
const MiniThumb = ({
  item,
  autoPlate,
  className,
}: {
  item: MarketplaceItemRenderFields
  autoPlate: ShowcaseMiniSnapshot['autoPlate']
  className: string
}): ReactNode =>
{
  if (!item.media) return null
  const backdrop = resolveItemBackdrop(item, autoPlate)
  return (
    <img
      src={item.media.url}
      alt=""
      loading="lazy"
      className={`${className}${backdrop ? ' p-0.5' : ''}`}
      style={{ backgroundColor: backdrop }}
    />
  )
}

// thumbnails at the parent's height, natural width, packed left & clipped
const ThumbStrip = ({
  items,
  autoPlate,
  className,
}: {
  items: MarketplaceItemRenderFields[]
  autoPlate: ShowcaseMiniSnapshot['autoPlate']
  className?: string
}) => (
  <div
    className={`flex items-center gap-px overflow-hidden ${className ?? ''}`}
  >
    {items.map((item) => (
      <MiniThumb
        key={item.order}
        item={item}
        autoPlate={autoPlate}
        className="h-full w-auto shrink-0 object-cover"
      />
    ))}
  </div>
)

// items fill the full row height at their natural width (no crop, no letterbox)
// over each item's plate; packed left & clipped at the row edge like a real tier
const ShowcaseMiniBoard = ({ mini }: { mini: ShowcaseMiniSnapshot }) => (
  <div className="flex h-full w-full flex-col gap-px bg-[var(--t-border)]">
    {mini.tiers.map((tier, tierIndex) => (
      <div
        key={tierIndex}
        className="flex min-h-0 flex-1 items-center gap-px overflow-hidden"
        style={{ backgroundColor: tierColor(tier) }}
      >
        {tier.items.map((item) => (
          <MiniThumb
            key={item.order}
            item={item}
            autoPlate={mini.autoPlate}
            className="h-full w-auto shrink-0 object-cover"
          />
        ))}
      </div>
    ))}
  </div>
)

// gutter label: 'initial' -> single uppercased grapheme (profile cropped tile);
// 'name' -> full tier name clamped to 1 line (library cover, where numbered &
// repeated-initial presets would otherwise render an unreadable column)
type TierLabelMode = 'initial' | 'name'

// one tier-row gutter. 'initial' is byte-identical to the profile cropped tile's
// slim w-4 letter; 'name' widens to w-9 & clamps the full name to 1 line so
// short names ("#10"/"Gold"/"Love") stay legible (longer names like "Bronze" truncate)
const TierRowGutter = ({
  tier,
  color,
  labelMode,
}: {
  tier: ShowcaseMiniTier
  color: string
  labelMode: TierLabelMode
}) =>
  labelMode === 'name' ? (
    <span
      className="flex w-9 shrink-0 items-center justify-center overflow-hidden border-r border-[var(--t-border)] px-1 text-[8px] font-normal leading-none"
      style={{ backgroundColor: color, color: getTextColor(color) }}
    >
      <span className="line-clamp-1">{tier.name}</span>
    </span>
  ) : (
    <span
      className="flex w-4 shrink-0 items-center justify-center border-r border-[var(--t-border)] text-[10px] font-normal leading-none"
      style={{ backgroundColor: color, color: getTextColor(color) }}
    >
      {tierInitial(tier)}
    </span>
  )

// the cropped-card tier-rows body, shared by the profile cropped tile & the
// library cover. a color gutter + label per tier, then a lane of width-capped
// thumbs packed left & clipped at the row edge
export const ShowcaseMiniTierRows = ({
  mini,
  labelMode = 'initial',
}: {
  mini: ShowcaseMiniSnapshot
  labelMode?: TierLabelMode
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-px bg-[var(--t-border)]">
    {mini.tiers.map((tier, tierIndex) =>
    {
      const color = tierColor(tier)
      return (
        <div
          key={tierIndex}
          className="flex min-h-0 flex-1 items-stretch overflow-hidden bg-[var(--t-bg)]"
        >
          <TierRowGutter tier={tier} color={color} labelMode={labelMode} />
          <div className="flex min-w-0 flex-1 items-center gap-px overflow-hidden px-0.5">
            {tier.items.map((item) => (
              <MiniThumb
                key={item.order}
                item={item}
                autoPlate={mini.autoPlate}
                className="h-full w-auto max-w-[56px] shrink-0 object-contain"
              />
            ))}
          </div>
        </div>
      )
    })}
  </div>
)

// top-row card: top-tier labels plus secondary thumbnails
const ShowcaseTopRowCard = ({ mini, title }: MiniCardProps) =>
{
  const [top, second, ...rest] = mini.tiers
  const restItems = rest.flatMap((tier) => tier.items)
  if (!top) return <ShowcaseTileFallback title={title} />

  return (
    <div className="flex h-full w-full flex-col bg-[var(--t-bg-surface)]">
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-1.5">
        <div className="flex items-center gap-1">
          <TierBadge tier={top} />
          <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--t-text-faint)]">
            tier
          </span>
        </div>
        <p className="line-clamp-3 text-[11px] font-bold leading-snug text-[var(--t-text)]">
          {top.labels.join(', ') || `${top.itemCount} picks`}
        </p>
        {second ? (
          <p className="line-clamp-1 text-[10px] text-[var(--t-text-secondary)]">
            <span className="font-bold">{second.name}:</span>{' '}
            {second.labels.join(', ') || `${second.itemCount} picks`}
          </p>
        ) : null}
        <ThumbStrip
          items={restItems}
          autoPlate={mini.autoPlate}
          className="mt-auto h-5 opacity-40"
        />
      </div>
      <ShowcaseTileCaption title={title} />
    </div>
  )
}

// cropped card (chosen): the ranking's top tiers as real tier-list rows — a slim
// color gutter + a dark lane of width-capped thumbs, packed left
const ShowcaseCroppedCard = ({ mini, title }: MiniCardProps) => (
  <div className="flex h-full w-full flex-col bg-[var(--t-bg-surface)]">
    <ShowcaseMiniTierRows mini={mini} labelMode="initial" />
    <ShowcaseTileCaption title={title} />
  </div>
)

// summary card: title, top-tier labels, counts, recency, & thumbnails
const ShowcaseSummaryCard = ({ mini, title }: MiniCardProps) =>
{
  const top = mini.tiers[0]
  const strip = mini.tiers.flatMap((tier) => tier.items)
  if (!top) return <ShowcaseTileFallback title={title} />

  return (
    <div className="flex h-full w-full flex-col gap-1 bg-[var(--t-bg-surface)] p-1.5">
      <p className="line-clamp-2 text-[11px] font-black leading-tight text-[var(--t-text)]">
        {title}
      </p>
      <p className="line-clamp-2 text-[10px] leading-snug text-[var(--t-text-secondary)]">
        <span className="font-black text-[var(--t-text)]">{top.name}:</span>{' '}
        {top.labels.slice(0, 3).join(', ') || `${top.itemCount} picks`}
      </p>
      <p className="text-[9px] text-[var(--t-text-faint)]">
        {mini.rankedCount} ranked · <RelativeTime ts={mini.updatedAt} />
      </p>
      <ThumbStrip
        items={strip}
        autoPlate={mini.autoPlate}
        className="mt-auto h-6"
      />
    </div>
  )
}

// winners card: top/bottom labels over a dimmed mini-board backdrop
const ShowcaseWinnersCard = ({ mini, title }: MiniCardProps) =>
{
  const topPick = mini.topPickLabel
  const bottomPick = mini.bottomPickLabel

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--t-bg-surface)]">
      <div className="absolute inset-0 scale-110 opacity-25 blur-[2px]">
        <ShowcaseMiniBoard mini={mini} />
      </div>
      <div className="absolute inset-0 bg-[rgb(var(--t-overlay)/0.55)]" />
      <div className="relative flex h-full w-full flex-col justify-end gap-0.5 p-1.5">
        <p className="line-clamp-2 text-[11px] font-black uppercase leading-tight tracking-wide text-white">
          {title}
        </p>
        {topPick ? (
          <p className="line-clamp-1 text-[9px] text-white/90">
            <span className="font-bold text-[var(--t-accent)]">Top</span>{' '}
            {topPick}
          </p>
        ) : null}
        {bottomPick ? (
          <p className="line-clamp-1 text-[9px] text-white/70">
            <span className="font-bold">Bottom</span> {bottomPick}
          </p>
        ) : null}
        <p className="text-[9px] text-white/60">{mini.rankedCount} ranked</p>
      </div>
    </div>
  )
}

const TierBadge = ({ tier }: { tier: ShowcaseMiniTier }) =>
{
  const color = tierColor(tier)
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-black leading-none"
      style={{ backgroundColor: color, color: getTextColor(color) }}
    >
      {tier.name}
    </span>
  )
}

// cover mode: legible over a poster via the bottom gradient
const ShowcaseTileTitle = ({ title }: { title: string }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgb(var(--t-overlay)/0.85)] to-transparent px-1.5 pb-1 pt-4">
    <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white">
      {title}
    </span>
  </div>
)

// caption strip below a board-style card so the title never covers tiers
const ShowcaseTileCaption = ({ title }: { title: string }) => (
  <div className="shrink-0 border-t border-[var(--t-border)] bg-[var(--t-bg-surface)] px-1.5 py-1">
    <span className="line-clamp-1 text-[10px] font-semibold leading-tight text-[var(--t-text)]">
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

// full mini: the ranking's top tiers as a compact tier-list w/ a caption strip
const ShowcaseFullMiniCard = ({ mini, title }: MiniCardProps) => (
  <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--t-bg-surface)]">
    <div className="min-h-0 flex-1">
      <ShowcaseMiniBoard mini={mini} />
    </div>
    <ShowcaseTileCaption title={title} />
  </div>
)

// non-cover tile mode -> card renderer. the Record key type forces every mode
// to be mapped, so adding a SHOWCASE_TILE_MODE without a card fails to compile
const MINI_CARDS: Record<
  Exclude<ShowcaseTileMode, 'cover'>,
  (props: MiniCardProps) => ReactNode
> = {
  mini: ShowcaseFullMiniCard,
  topRow: ShowcaseTopRowCard,
  cropped: ShowcaseCroppedCard,
  summary: ShowcaseSummaryCard,
  winners: ShowcaseWinnersCard,
}

export const ShowcaseTileContent = ({
  tile,
  tileMode,
  title,
  frameAspectRatio = 1,
  imageLoading = 'lazy',
}: ShowcaseTileContentProps) =>
{
  const mini = tile?.mini ?? null
  const cover = tile?.cover ?? null

  // every non-cover mode derives from the mini snapshot
  if (tileMode !== 'cover' && mini && mini.tiers.length > 0)
  {
    const MiniCard = MINI_CARDS[tileMode]
    return <MiniCard mini={mini} title={title} />
  }

  // cover mode, or any mini-less ranking falling back to its template cover
  if (cover)
  {
    return (
      <div className="relative h-full w-full overflow-hidden">
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
        <ShowcaseTileTitle title={title} />
      </div>
    )
  }

  return <ShowcaseTileFallback title={title} />
}
