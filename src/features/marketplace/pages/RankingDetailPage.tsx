// src/features/marketplace/pages/RankingDetailPage.tsx
// public ranking detail — read-only tier rows, source-template breadcrumb,
// & a Remix CTA that clones the snapshot into a fresh local board

import { Eye, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'

import {
  type MarketplaceRankingDetail,
  type MarketplaceRankingItem,
  type MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardAutoPlateSettings } from '@tierlistbuilder/contracts/workspace/board'
import { majorityAspectRatio } from '@tierlistbuilder/contracts/workspace/aspectRatio'

import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { getTextColor } from '~/shared/lib/color'
import { useRankingDetailRoute } from '~/features/marketplace/model/detail/useMarketplaceDetailRoute'
import { useRecordRankingView } from '~/features/marketplace/model/analytics/useRecordRankingView'
import { useRemixRanking } from '~/features/marketplace/model/remix/useRemixRanking'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { ButtonLink } from '~/shared/ui/Button'
import { Avatar } from '~/shared/ui/Avatar'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { CriterionBadge } from '~/features/marketplace/ui/consensus/criterion/CriterionBadge'
import { NotFoundSurface } from '~/shared/ui/NotFoundSurface'
import { MarketplaceBreadcrumb } from '~/features/marketplace/ui/layout/MarketplaceBreadcrumb'
import { MetaPill } from '~/features/marketplace/ui/meta/MetaPill'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { PAGE_DETAIL_TOP_LEVEL } from '~/shared/ui/pageContainer'
import { DetailStatTile } from '~/features/marketplace/ui/cards/cardPrimitives'

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

const NotFound = () => (
  <NotFoundSurface
    title="Ranking not found"
    body="It may have been unpublished or the link might be wrong."
    actionLabel="Browse templates"
    to={TEMPLATES_ROUTE_PATH}
  />
)

const DetailSkeleton = () => (
  <section aria-hidden="true" className={PAGE_DETAIL_TOP_LEVEL}>
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

  const frameAspectRatio = useMemo(() =>
  {
    const ratios = detail.items
      .map((item) => item.aspectRatio)
      .filter(
        (ratio): ratio is number => typeof ratio === 'number' && ratio > 0
      )
    return majorityAspectRatio(ratios) ?? ITEM_FRAME_RATIO_FALLBACK
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
  const route = useRankingDetailRoute()
  const readyDetail = route.status === 'ready' ? route.detail : null
  useRecordRankingView(readyDetail ? readyDetail.slug : null)
  useDocumentTitle(
    readyDetail ? `${readyDetail.title} · TierListBuilder` : null
  )
  const remix = useRemixRanking()

  if (route.status === 'missing') return <NotFound />
  if (route.status === 'loading') return <DetailSkeleton />

  const detail = route.detail
  const categoryLabel = CATEGORY_META[detail.template.category].label
  const handleRemix = () =>
  {
    void remix.run(detail.slug, detail.title)
  }

  return (
    <article className={PAGE_DETAIL_TOP_LEVEL}>
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
          <DetailStatTile
            label="Remixes"
            value={formatCount(detail.remixCount)}
            icon={Sparkles}
          />
          <DetailStatTile
            label="Views"
            value={formatCount(detail.viewCount)}
            icon={Eye}
          />
          <DetailStatTile
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
          <ButtonLink
            to={`${TEMPLATES_ROUTE_PATH}/${detail.template.slug}`}
            surface="filled"
            size="md"
            className="h-10 px-4"
          >
            View source template
          </ButtonLink>
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
