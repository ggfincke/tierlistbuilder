// src/features/marketplace/ui/consensus/compare/laneUtils.ts
// shared math + joining helpers for the criterion compare surface — keeps
// the viz components focused on layout instead of re-deriving stats

import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

// each row is the left + right aggregate item for the same templateItemId,
// pre-paired so downstream viz can iterate without index gymnastics
export interface CompareJoinedRow
{
  templateItemExternalId: string
  left: MarketplaceTemplateRankingAggregateItem
  right: MarketplaceTemplateRankingAggregateItem
  // signed delta: positive = right lane ranks higher, negative = left
  // higher. derived from the modal bucket so it shares units w/ the
  // stacked-distribution viz the rest of the app uses
  delta: number
  absDelta: number
}

export type DivergenceSort =
  | 'absDelta'
  | 'leftFirst'
  | 'rightFirst'
  | 'mostSamples'

export const DIVERGENCE_SORT_LABELS: Record<DivergenceSort, string> = {
  absDelta: 'Biggest gap',
  leftFirst: 'Higher in left',
  rightFirst: 'Higher in right',
  mostSamples: 'Most samples',
}

export const compareJoinedRowsByDivergence = (
  sort: DivergenceSort
): ((a: CompareJoinedRow, b: CompareJoinedRow) => number) =>
{
  switch (sort)
  {
    case 'absDelta':
      return (a, b) => b.absDelta - a.absDelta
    case 'leftFirst':
      return (a, b) => a.delta - b.delta
    case 'rightFirst':
      return (a, b) => b.delta - a.delta
    case 'mostSamples':
      return (a, b) =>
        b.left.sampleCount +
        b.right.sampleCount -
        (a.left.sampleCount + a.right.sampleCount)
  }
}

// joins two lanes' aggregate items by templateItemExternalId; drops
// half-pairs so viz code can trust both sides exist. returns rows in
// stable template order to keep side-by-side aligned w/ the detail page
export const joinLanesByTemplateItem = (
  leftItems: readonly MarketplaceTemplateRankingAggregateItem[],
  rightItems: readonly MarketplaceTemplateRankingAggregateItem[]
): CompareJoinedRow[] =>
{
  const rightByItemId = new Map<
    string,
    MarketplaceTemplateRankingAggregateItem
  >()
  for (const item of rightItems)
  {
    rightByItemId.set(item.templateItemExternalId, item)
  }
  const out: CompareJoinedRow[] = []
  for (const left of leftItems)
  {
    const right = rightByItemId.get(left.templateItemExternalId)
    if (!right) continue
    if (left.topBucketIndex === null || right.topBucketIndex === null)
    {
      // no signal in at least one lane — keep the row but mark delta as 0
      // so it sorts to the bottom of the divergence table
      out.push({
        templateItemExternalId: left.templateItemExternalId,
        left,
        right,
        delta: 0,
        absDelta: 0,
      })
      continue
    }
    const delta = left.topBucketIndex - right.topBucketIndex
    out.push({
      templateItemExternalId: left.templateItemExternalId,
      left,
      right,
      delta,
      absDelta: Math.abs(delta),
    })
  }
  return out
}

export interface CompareInsights
{
  // Pearson correlation of averageBucket across the two lanes; null when
  // sampleCount is zero on either side (no signal to correlate)
  correlation: number | null
  // mean absolute Δ tier across the joined rows
  avgDelta: number
  // count of items that moved 2+ tiers between lanes
  movedTwoPlus: number
  // total joined rows, exposed for fraction denominators in KPI cards
  sampleCount: number
  // narrative: which item is most stable across both lanes (low Δ, high
  // top-bucket share) & which is most divergent (high Δ)
  mostStable: CompareJoinedRow | null
  mostDivergent: CompareJoinedRow | null
  // Δ distribution across the joined rows; index === Δ tier value, value
  // === count of items at that Δ. powers the histogram KPI sparkline
  deltaHistogram: number[]
}

export const computeCompareInsights = (
  rows: readonly CompareJoinedRow[],
  bucketCount: number
): CompareInsights =>
{
  if (rows.length === 0)
  {
    return {
      correlation: null,
      avgDelta: 0,
      movedTwoPlus: 0,
      sampleCount: 0,
      mostStable: null,
      mostDivergent: null,
      deltaHistogram: new Array(Math.max(1, bucketCount)).fill(0),
    }
  }
  let sumAbsDelta = 0
  let movedTwoPlus = 0
  let mostStable: CompareJoinedRow | null = null
  let mostStableScore = -Infinity
  let mostDivergent: CompareJoinedRow | null = null
  let mostDivergentDelta = -1
  let n = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  const histogramSize = Math.max(1, bucketCount)
  const deltaHistogram = new Array<number>(histogramSize).fill(0)
  for (const row of rows)
  {
    sumAbsDelta += row.absDelta
    if (row.absDelta >= 2) movedTwoPlus += 1
    if (row.absDelta > mostDivergentDelta)
    {
      mostDivergent = row
      mostDivergentDelta = row.absDelta
    }
    // stability score: heavily penalize Δ, reward strong agreement on both
    // sides — same heuristic used by the design exploration so the surface
    // reads consistently w/ the static export
    const stability =
      -row.absDelta * 10 + row.left.topBucketShare + row.right.topBucketShare
    if (stability > mostStableScore)
    {
      mostStable = row
      mostStableScore = stability
    }
    if (row.absDelta < deltaHistogram.length)
    {
      deltaHistogram[row.absDelta] += 1
    }
    if (row.left.averageBucket !== null && row.right.averageBucket !== null)
    {
      const x = row.left.averageBucket
      const y = row.right.averageBucket
      n += 1
      sx += x
      sy += y
      sxx += x * x
      syy += y * y
      sxy += x * y
    }
  }
  const denom = n > 1 ? Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy)) : 0
  const correlation = denom === 0 ? null : (n * sxy - sx * sy) / denom
  return {
    correlation,
    avgDelta: sumAbsDelta / rows.length,
    movedTwoPlus,
    sampleCount: rows.length,
    mostStable,
    mostDivergent,
    deltaHistogram,
  }
}

export const classifyCorrelation = (
  correlation: number | null
): { copy: string; tone: string } =>
{
  if (correlation === null)
  {
    return { copy: 'Not enough overlap', tone: 'var(--t-text-muted)' }
  }
  if (correlation >= 0.75)
  {
    return { copy: 'Lanes agree closely', tone: 'var(--t-success)' }
  }
  if (correlation >= 0.4)
  {
    return { copy: 'Loose alignment', tone: 'var(--t-success)' }
  }
  if (correlation >= 0.05)
  {
    return { copy: 'Mostly independent', tone: 'var(--t-warning, #facc15)' }
  }
  if (correlation >= -0.4)
  {
    return { copy: 'Different stories', tone: 'var(--t-text-muted)' }
  }
  return { copy: 'Inverted - opposite picks', tone: 'var(--t-destructive)' }
}

// short copy describing a Pearson value in plain English. shared between
// the gauge insight card & the lane header so the two surfaces don't
// drift out of sync
export const correlationCopy = (correlation: number | null): string =>
  classifyCorrelation(correlation).copy

// short copy describing whether a delta favors the left or right lane.
// returns null when delta === 0 so callers can collapse the row without
// rendering a redundant "Same tier" line
export const compareDirectionCopy = (
  delta: number,
  leftShortName: string,
  rightShortName: string
): string =>
{
  if (delta === 0) return 'Same tier in both lanes'
  if (delta > 0) return `Higher in ${rightShortName}`
  return `Higher in ${leftShortName}`
}

// per-lane tones — single source of truth for compare-surface direction
// cues across the compare surface read as the same lane identity. when
// communicating "this item is higher in lane X", color w/ these
export const LEFT_LANE_TONE = 'var(--t-accent)'
export const RIGHT_LANE_TONE = 'var(--t-success)'

// returns the lane tone the delta favors. magnitude should be encoded
// separately (font weight, dot size, etc.) so hue stays a clean
// direction signal & doesn't double as a "bigger Δ = bad" alarm
export const compareDeltaDirectionTone = (delta: number): string =>
{
  if (delta < 0) return LEFT_LANE_TONE
  if (delta > 0) return RIGHT_LANE_TONE
  return 'var(--t-text-faint)'
}

// utility: ensure a 2D bucket flow matrix [leftIndex][rightIndex] = count
// suitable for the sankey ribbon rendering. drops rows where either lane
// has no top bucket so we don't render ghost ribbons
export const buildBucketFlowMatrix = (
  rows: readonly CompareJoinedRow[],
  bucketCount: number
): number[][] =>
{
  const matrix: number[][] = Array.from({ length: bucketCount }, () =>
    new Array<number>(bucketCount).fill(0)
  )
  for (const row of rows)
  {
    if (row.left.topBucketIndex === null) continue
    if (row.right.topBucketIndex === null) continue
    matrix[row.left.topBucketIndex][row.right.topBucketIndex] += 1
  }
  return matrix
}
