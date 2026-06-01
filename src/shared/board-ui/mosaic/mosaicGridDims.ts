// src/shared/board-ui/mosaic/mosaicGridDims.ts
// grid sizing helpers for mosaic covers (marketplace cards & library boards)

const DIM_CAP = 16

// pick (cols, rows) for itemCount in a container of shape coverAspect. cols/
// rows are chosen so the grid aspect ~ coverAspect, so the top-left cover-fill
// clips as little as possible off the right/bottom edge
export const computeGridDims = (
  itemCount: number,
  maxSlots: number,
  coverAspect: number,
  cellAspect: number
): { cols: number; rows: number } =>
{
  // guard the divisor: a 0/negative cell aspect (corrupt or unset) would make
  // the dims non-finite, so fall back to square
  const safeCellAspect = cellAspect > 0 ? cellAspect : 1

  if (itemCount <= 0)
  {
    const targetColsRows = Math.max(coverAspect / safeCellAspect, 0.05)
    const cols = Math.max(1, Math.round(Math.sqrt(maxSlots * targetColsRows)))
    return { cols, rows: Math.max(1, Math.ceil(maxSlots / cols)) }
  }

  // tile budget: per-density cap when source is larger; source size when
  // smaller (so every item up to the cap receives a visible slot)
  const budget = Math.min(maxSlots, itemCount)
  const dimCap = Math.min(DIM_CAP, budget)
  const slotCeiling =
    itemCount > maxSlots
      ? maxSlots
      : Math.min(
          maxSlots,
          budget + Math.max(0, Math.ceil(Math.sqrt(budget)) - 1)
        )

  let bestCols = 1
  let bestRows = 1
  let bestScore = Number.POSITIVE_INFINITY

  for (let cols = 1; cols <= dimCap; cols++)
  {
    for (let rows = 1; rows <= dimCap; rows++)
    {
      const slots = cols * rows
      if (slots < budget || slots > slotCeiling) continue

      // asymmetric: a narrow grid overflows the bottom (whole rows clipped,
      // looks off), a wide grid overflows the right (a marquee). penalize
      // narrowness ~3.6x harder so wide layouts win across aspects
      const gridAspect = (cols * safeCellAspect) / rows
      const ratioPenalty =
        gridAspect < coverAspect
          ? Math.log(coverAspect / gridAspect) * 18
          : Math.log(gridAspect / coverAspect) * 5
      const skinny = 2 / Math.min(cols, rows)
      const singleRow = rows === 1 && budget > 2 ? 8 : 0
      // at rich budgets, push for 3+ rows so the cover reads as a content
      // wall instead of a thin marquee
      const fewRows = budget >= 18 && rows < 3 ? 5 : 0
      const portraitBias = cols < rows ? 0.1 : 0
      const unfilled = (slots - budget) * 0.5

      const score =
        ratioPenalty + skinny + singleRow + fewRows + portraitBias + unfilled

      if (score < bestScore)
      {
        bestScore = score
        bestCols = cols
        bestRows = rows
      }
    }
  }

  return { cols: bestCols, rows: bestRows }
}
