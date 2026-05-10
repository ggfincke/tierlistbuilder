// src/features/marketplace/components/consensus/compare/CompareNarrativeCards.tsx
// editorial callout pair: most-stable + most-divergent item across the
// two lanes; uses the real aggregate item thumb for visual recognition

import { Flame, Sparkles } from 'lucide-react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../AggregateItemThumb'
import { DistributionBar } from '../DistributionBar'
import { formatPercent, getAggregateItemLabel, resolveBucketColor } from '../utils'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { pluralizeWord } from '~/shared/lib/pluralize'

import { CompareCard } from './CompareCard'
import { safeBucketLabel, type CompareJoinedRow } from './laneUtils'

interface CompareNarrativeCardsProps
{
  mostStable: CompareJoinedRow | null
  mostDivergent: CompareJoinedRow | null
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  leftShortName: string
  rightShortName: string
}

interface NarrativeCardProps
{
  eyebrow: string
  accent: string
  icon: typeof Sparkles
  row: CompareJoinedRow
  line: string
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
}

interface MiniDistProps
{
  side: 'left' | 'right'
  laneShortName: string
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  // intentionally narrowed to the aggregate item subset DistributionBar
  // & the tier-color helpers actually consume
  row: CompareJoinedRow['left']
}

const MiniDist = ({ side, laneShortName, buckets, row }: MiniDistProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const topBucket =
    row.topBucketIndex !== null ? buckets[row.topBucketIndex] : undefined
  const topColor = resolveBucketColor(topBucket, paletteId)
  return (
    <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-2">
      <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            side === 'left' ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-success)]'
          }`}
        />
        {laneShortName}
        <span className="ml-auto font-semibold" style={{ color: topColor }}>
          {safeBucketLabel(buckets, row.topBucketIndex)}
        </span>
        <span className="text-[var(--t-text-secondary)]">
          {formatPercent(row.topBucketShare)}
        </span>
      </p>
      <div className="mt-1.5">
        <DistributionBar
          buckets={buckets}
          distribution={row.distribution}
          sampleCount={row.sampleCount}
          height={6}
        />
      </div>
    </div>
  )
}

const NarrativeCard = ({
  eyebrow,
  accent,
  icon: Icon,
  row,
  line,
  frame,
  labelSettings,
}: NarrativeCardProps) => (
  <CompareCard>
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3" strokeWidth={2} style={{ color: accent }} />
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        {eyebrow}
      </p>
    </div>
    <div className="mt-2 flex items-center gap-3">
      <AggregateItemThumb
        row={row.left}
        frame={frame}
        labelSettings={labelSettings}
        size={64}
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-[var(--t-text)]">
          {getAggregateItemLabel(row.left)}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--t-text-muted)]">
          {line}
        </p>
      </div>
    </div>
  </CompareCard>
)

const NarrativeFallback = ({
  eyebrow,
  accent,
  icon: Icon,
  body,
}: {
  eyebrow: string
  accent: string
  icon: typeof Sparkles
  body: string
}) => (
  <div className="rounded-xl border border-dashed border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4">
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3" strokeWidth={2} style={{ color: accent }} />
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        {eyebrow}
      </p>
    </div>
    <p className="mt-2 text-[12px] text-[var(--t-text-muted)]">{body}</p>
  </div>
)

export const CompareNarrativeCards = ({
  mostStable,
  mostDivergent,
  buckets,
  frame,
  labelSettings,
  leftShortName,
  rightShortName,
}: CompareNarrativeCardsProps) =>
{
  const STABLE_TONE = 'var(--t-success)'
  const DIVERGENT_TONE = 'var(--t-destructive)'
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {mostStable ? (
        <div className="flex flex-col gap-3">
          <NarrativeCard
            eyebrow="Most stable"
            accent={STABLE_TONE}
            icon={Sparkles}
            row={mostStable}
            line={
              mostStable.left.topBucketIndex === mostStable.right.topBucketIndex
                ? `Both lanes land in tier ${safeBucketLabel(
                    buckets,
                    mostStable.left.topBucketIndex
                  )} · ${formatPercent(
                    mostStable.left.topBucketShare
                  )} / ${formatPercent(mostStable.right.topBucketShare)} agreement.`
                : `${safeBucketLabel(
                    buckets,
                    mostStable.left.topBucketIndex
                  )} / ${safeBucketLabel(
                    buckets,
                    mostStable.right.topBucketIndex
                  )} top — strong agreement on both sides (${formatPercent(
                    mostStable.left.topBucketShare
                  )} / ${formatPercent(mostStable.right.topBucketShare)}).`
            }
            frame={frame}
            labelSettings={labelSettings}
          />
          <div className="grid grid-cols-2 gap-2">
            <MiniDist
              side="left"
              laneShortName={leftShortName}
              buckets={buckets}
              row={mostStable.left}
            />
            <MiniDist
              side="right"
              laneShortName={rightShortName}
              buckets={buckets}
              row={mostStable.right}
            />
          </div>
        </div>
      ) : (
        <NarrativeFallback
          eyebrow="Most stable"
          accent={STABLE_TONE}
          icon={Sparkles}
          body="Once both lanes have signal on the same items, we'll surface the most stable pick here."
        />
      )}
      {mostDivergent && mostDivergent.absDelta > 0 ? (
        <div className="flex flex-col gap-3">
          <NarrativeCard
            eyebrow="Most divergent"
            accent={DIVERGENT_TONE}
            icon={Flame}
            row={mostDivergent}
            line={`${safeBucketLabel(
              buckets,
              mostDivergent.left.topBucketIndex
            )} in ${leftShortName}, ${safeBucketLabel(
              buckets,
              mostDivergent.right.topBucketIndex
            )} in ${rightShortName}. Δ${mostDivergent.absDelta} ${pluralizeWord(
              mostDivergent.absDelta,
              'tier'
            )}.`}
            frame={frame}
            labelSettings={labelSettings}
          />
          <div className="grid grid-cols-2 gap-2">
            <MiniDist
              side="left"
              laneShortName={leftShortName}
              buckets={buckets}
              row={mostDivergent.left}
            />
            <MiniDist
              side="right"
              laneShortName={rightShortName}
              buckets={buckets}
              row={mostDivergent.right}
            />
          </div>
        </div>
      ) : (
        <NarrativeFallback
          eyebrow="Most divergent"
          accent={DIVERGENT_TONE}
          icon={Flame}
          body="Lanes are close enough that no item swings hard between them yet."
        />
      )}
    </div>
  )
}
