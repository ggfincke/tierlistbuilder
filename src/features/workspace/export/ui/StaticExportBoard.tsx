// src/features/workspace/export/ui/StaticExportBoard.tsx
// static board renderer used by isolated export capture sessions

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '~/features/workspace/export/model/runtime'
import { EXPORT_BOARD_ROOT_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { StaticBoard } from '~/shared/board-ui/StaticBoard'

interface StaticExportBoardProps
{
  data: BoardSnapshot
  appearance: ExportAppearance
  backgroundColor: string
}

// shrink configured wrap to the largest populated row so exports don't
// reserve empty slot width past the last item on every tier
const capMaxItemsPerRowToActual = (
  data: BoardSnapshot,
  configured: ExportAppearance['maxItemsPerRow']
): ExportAppearance['maxItemsPerRow'] =>
{
  if (
    configured === null ||
    configured === undefined ||
    !Number.isFinite(configured)
  )
  {
    return configured
  }

  let actualMax = 0
  for (const tier of data.tiers)
  {
    if (tier.itemIds.length > actualMax) actualMax = tier.itemIds.length
  }

  if (actualMax === 0) return configured
  return Math.min(configured, actualMax)
}

export const StaticExportBoard = ({
  data,
  appearance,
  backgroundColor,
}: StaticExportBoardProps) =>
{
  const effectiveAppearance: ExportAppearance = {
    ...appearance,
    maxItemsPerRow: capMaxItemsPerRowToActual(data, appearance.maxItemsPerRow),
  }

  return (
    <StaticBoard
      data={data}
      appearance={effectiveAppearance}
      backgroundColor={backgroundColor}
      className="min-w-[860px]"
      imageLoading="eager"
      data-testid={EXPORT_BOARD_ROOT_TEST_ID}
    />
  )
}
