// src/features/workspace/export/ui/StaticExportBoard.tsx
// static board renderer used by isolated export capture sessions

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '../model/runtime'
import { EXPORT_BOARD_ROOT_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { StaticBoard } from '~/shared/board-ui/StaticBoard'

interface StaticExportBoardProps
{
  data: BoardSnapshot
  appearance: ExportAppearance
  backgroundColor: string
}

export const StaticExportBoard = ({
  data,
  appearance,
  backgroundColor,
}: StaticExportBoardProps) => (
  <StaticBoard
    data={data}
    appearance={appearance}
    backgroundColor={backgroundColor}
    className="min-w-[860px]"
    data-testid={EXPORT_BOARD_ROOT_TEST_ID}
  />
)
