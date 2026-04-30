// src/features/workspace/export/lib/exportJson.ts
// JSON export utility for board data

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import { toFileBase } from '~/shared/lib/fileName'
import { downloadBlob } from '~/shared/lib/downloadBlob'
import { snapshotToWire } from '~/shared/board-data/boardWireMapper'

interface TierListExport
{
  version: number
  exportedAt: string
  data: BoardSnapshotWire
}

// download board state as self-contained JSON
export const exportBoardAsJson = async (
  data: BoardSnapshot,
  title: string
): Promise<void> =>
{
  const wire = await snapshotToWire(data)
  const payload: TierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data: wire,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, `${toFileBase(title)}.json`)
}
