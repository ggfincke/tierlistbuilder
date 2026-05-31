// src/features/marketplace/pages/RankingDetailPage.tsx
// public ranking detail — read-only tier rows, source-template breadcrumb,
// & a Remix CTA that clones the snapshot into a fresh local board

import { Eye, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { useMemo, type ComponentType, type SVGProps } from 'react'
import { Link } from 'react-router-dom'

import {
  isRankingSlug,
  type MarketplaceRankingDetail,
  type MarketplaceRankingItem,
  type MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardAutoPlateSettings } from '@tierlistbuilder/contracts/workspace/board'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { getTextColor } from '~/shared/lib/color'
import { useRankingBySlug } from '~/features/marketplace/model/detail/useRankingDetail'
import { useRecordRankingView } from '~/features/marketplace/model/analytics/useRecordRankingView'
import { useRemixRanking } from '~/features/marketplace/model/remix/useRemixRanking'
import { useValidatedSlug } from '~/features/marketplace/model/detail/useValidatedSlug'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { Avatar } from '~/shared/ui/Avatar'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import {
  RANKINGS_ROUTE_PATH,
  TEMPLATES_ROUTE_PATH,
} from '~/shared/routes/pathname'
import { CriterionBadge } from '~/features/marketplace/ui/consensus/criterion/CriterionBadge'
import { MarketplaceNotFound } from '~/features/marketplace/ui/layout/MarketplaceNotFound'
import { MarketplaceBreadcrumb } from '~/features/marketplace/ui/layout/MarketplaceBreadcrumb'
import { MetaPill } from '~/features/marketplace/ui/meta/MetaPill'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { PAGE_SHELL } from '~/shared/ui/pageContainer'

// neutral palette for ranking surfaces; viewers don't carry workspace prefs
const RANKING_PALETTE_ID = 'classic' as const
const ITEM_FRAME_RATIO_FALLBACK = 1
const TILE_LONG_EDGE_PX = 96

interface ItemTileProps
{
  item: MarketplaceRankingItem
  frameAspectRatio: number
  autoPlate: BoardAutoPlateSettings | null
  defaultItemImagePadding: number | null
}

const ItemTile = ({
  item,
  frameAspectRatio,
  autoPlate,
  defaultItemImagePadding,
}: ItemTileProps) =>
{
  const labelDisplay = resolveLabelDisplay({
    itemLabel: item.label ?? undefined,
    itemOptions: undefined,
    boardSettings: undefined,
    globalLabelDefaults: {
      showLabels: false,
      placementMode: 'overlay',
      fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
    },
  })
  return (
    <div
      className="relative overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
      style={{
        width: TILE_LONG_EDGE_PX,
        height: Math.round(TILE_LONG_EDGE_PX / frameAspectRatio),
      }}
    >
      <ItemContent
        item={{
          imageUrl: item.media?.url,
          label: item.label ?? undefined,
          backgroundColor: item.backgroundColor ?? undefined,
          mediaPlate: item.mediaPlate ?? undefined,
          altText: item.altText ?? undefined,
          aspectRatio: item.aspectRatio ?? undefined,
          transform: item.transform ?? undefined,
          imagePadding: item.imagePadding ?? undefined,
        }}
        autoPlate={autoPlate}
        defaultItemImagePadding={defaultItemImagePadding ?? undefined}
        label={labelDisplay}
        fit={item.imageFit ?? 'cover'}
        frameAspectRatio={frameAspectRatio}
      />
    </div>
  )
}

interface TierRowProps
{
  tier: MarketplaceRankingTier
  items: MarketplaceRankingItem[]
  frameAspectRatio: number
  autoPlate: BoardAutoPlateSettings | null
  defaultItemImagePadding: number | null
  isFirst: boolean
}

const TierRow = ({
  tier,
  items,
  frameAspectRatio,
  autoPlate,
  defaultItemImagePadding,
  isFirst,
}: TierRowProps) =>
{
  const tierColor = resolveTierColorSpec(RANKING_PALETTE_ID, tier.colorSpec)
  const rowBg = tier.rowColorSpec
    ? resolveTierColorSpec(RANKING_PALETTE_ID, tier.rowColorSpec)
    : null
  return (
    <div
      className="flex"
      style={rowBg ? { backgroundColor: rowBg } : undefined}
    >
      <div
        className={`flex min-w-0 flex-1 border-b border-l border-[var(--t-border)] ${
          isFirst ? 'border-t' : ''
        }`}
      >
        <div
          className="flex shrink-0 items-center justify-center px-3 py-3 text-center text-base font-semibold"
          style={{
            width: 118,
            backgroundColor: tierColor,
            color: getTextColor(tierColor),
          }}
        >
          <div className="flex flex-col items-center">
            <span className="block max-w-full wrap-anywhere">{tier.name}</span>
            {tier.description && (
              <span className="mt-0.5 text-[10px] font-normal opacity-75">
                {tier.description}
              </span>
            )}
          </div>
        </div>
        <div
          className="flex flex-1 flex-wrap content-start gap-px bg-[var(--t-bg-surface)] p-0"
          style={{
            minHeight: Math.round(TILE_LONG_EDGE_PX / frameAspectRatio),
            ...(rowBg ? { backgroundColor: rowBg } : {}),
          }}
        >
          {items.map((item) => (
            <ItemTile
              key={item.externalId}
              item={item}
              frameAspectRatio={frameAspectRatio}
              autoPlate={autoPlate}
              defaultItemImagePadding={defaultItemImagePadding}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface StatTileProps
{
  label: string
  value: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const StatTile = ({ label, value, icon: Icon }: StatTileProps) => (
  <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-2.5">
    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
      <Icon className="h-3 w-3" strokeWidth={1.8} />
      {label}
    </span>
    <p className="mt-1 text-lg font-semibold text-[var(--t-text)]">{value}</p>
  </div>
)

const NotFound = () => (
  <MarketplaceNotFound
    title="Ranking not found"
    body="It may have been unpublished or the link might be wrong."
    actionLabel="Browse templates"
    to={TEMPLATES_ROUTE_PATH}
  />
)

const DetailSkeleton = () => (
  <section
    aria-hidden="true"
    className={`${PAGE_SHELL} pt-20 pb-20 sm:pt-24`}
  >
    <SkeletonText className="w-48" tone="soft" />
    <SkeletonBlock className="mt-5 h-9 w-2/3 rounded" tone="strong" />
    <SkeletonText className="mt-2 w-1/3" tone="soft" />
    <div className="mt-6 grid grid-cols-3 gap-2">
      <SkeletonBlock className="h-16 rounded-lg" tone="soft" />
      <SkeletonBlock className="h-16 rounded-lg" tone="soft" />
      <SkeletonBlock className="h-16 rounded-lg" tone="soft" />
    </div>
    <div className="mt-8 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24 rounded" tone="soft" />
      ))}
    </div>
  </section>
)

interface RankingBoardProps
{
  detail: MarketplaceRankingDetail
}

const RankingBoard = ({ detail }: RankingBoardProps) =>
{
  const itemsByTier = useMemo(() =>
  {
    const buckets = new Map<string, MarketplaceRankingItem[]>()
    for (const item of detail.items)
    {
      const key = item.tierExternalId ?? '__unranked'
      const bucket = buckets.get(key) ?? []
      bucket.push(item)
      buckets.set(key, bucket)
    }
    for (const bucket of buckets.values())
    {
      bucket.sort((a, b) => a.order - b.order)
    }
    return buckets
  }, [detail.items])

  const sortedTiers = useMemo(
    () => [...detail.tiers].sort((a, b) => a.order - b.order),
    [detail.tiers]
  )

  // ranking items can carry per-item aspect ratio; pick the most common one
  // for the frame so tier rows render w/ a consistent slot size
  const frameAspectRatio = useMemo(() =>
  {
    const ratios = detail.items
      .map((item) => item.aspectRatio)
      .filter(
        (ratio): ratio is number => typeof ratio === 'number' && ratio > 0
      )
    if (ratios.length === 0) return ITEM_FRAME_RATIO_FALLBACK
    const counts = new Map<number, number>()
    for (const ratio of ratios)
    {
      counts.set(ratio, (counts.get(ratio) ?? 0) + 1)
    }
    let best = ratios[0]
    let bestCount = 0
    for (const [ratio, count] of counts)
    {
      if (count > bestCount)
      {
        best = ratio
        bestCount = count
      }
    }
    return best
  }, [detail.items])

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      {sortedTiers.map((tier, index) => (
        <TierRow
          key={tier.externalId}
          tier={tier}
          items={itemsByTier.get(tier.externalId) ?? []}
          frameAspectRatio={frameAspectRatio}
          autoPlate={detail.autoPlate}
          defaultItemImagePadding={detail.defaultItemImagePadding}
          isFirst={index === 0}
        />
      ))}
    </div>
  )
}

export const RankingDetailPage = () =>
{
  const validSlug = useValidatedSlug(isRankingSlug)
  const detail = useRankingBySlug(validSlug)
  useRecordRankingView(detail ? detail.slug : null)
  useDocumentTitle(detail ? `${detail.title} · TierListBuilder` : null)
  const remix = useRemixRanking()

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <DetailSkeleton />
  if (detail === null) return <NotFound />

  const categoryLabel = CATEGORY_META[detail.template.category].label
  const handleRemix = () =>
  {
    void remix.run(detail.slug, detail.title)
  }

  return (
    <article className={`${PAGE_SHELL} pt-20 pb-20 sm:pt-24`}>
      <MarketplaceBreadcrumb
        items={[
          { label: 'Templates', to: TEMPLATES_ROUTE_PATH },
          {
            label: detail.template.title,
            to: `${TEMPLATES_ROUTE_PATH}/${detail.template.slug}`,
          },
          { label: detail.title },
        ]}
      />

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <MetaPill tone="accent" shape="pill">
            {categoryLabel}
          </MetaPill>
          <span className="rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
            Ranking
          </span>
          <CriterionBadge criterion={detail.criterion} />
        </div>

        <DisplayHeadline
          primary={detail.title}
          subtitle={detail.description ?? undefined}
          subtitleClassName="max-w-3xl text-sm leading-relaxed text-[var(--t-text-muted)]"
          size="page"
          maxWidthClassName="max-w-3xl"
          className="mt-3"
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--t-text-muted)]">
          <div className="flex items-center gap-2">
            <Avatar
              name={detail.author.displayName}
              src={detail.author.avatarUrl}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--t-text)]">
                {detail.author.displayName}
              </p>
              <p className="text-xs text-[var(--t-text-faint)]">
                Updated {formatRelativeTime(detail.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
          <StatTile
            label="Remixes"
            value={formatCount(detail.remixCount)}
            icon={Sparkles}
          />
          <StatTile
            label="Views"
            value={formatCount(detail.viewCount)}
            icon={Eye}
          />
          <StatTile
            label="Tiers"
            value={String(detail.tierCount)}
            icon={TrendingUp}
          />
        </div>

        <div className="mt-5 flex items-stretch gap-2">
          <PrimaryButton
            type="button"
            size="md"
            disabled={remix.isPending}
            onClick={handleRemix}
            className="h-10 px-4"
          >
            {remix.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Remixing…
              </>
            ) : (
              'Remix this ranking'
            )}
          </PrimaryButton>
          <Link
            to={`${TEMPLATES_ROUTE_PATH}/${detail.template.slug}`}
            className="focus-custom inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 text-sm font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            View source template
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <DisplayHeadline primary="The ranking" size="section" as="h2" />
        <p className="mt-2 text-xs text-[var(--t-text-muted)]">
          Read-only view. Hit Remix to make it your own.
        </p>
        <div className="mt-4">
          <RankingBoard detail={detail} />
        </div>
      </section>
    </article>
  )
}

// keep route paths colocated w/ the page to mirror the templates folder
export { RANKINGS_ROUTE_PATH }
