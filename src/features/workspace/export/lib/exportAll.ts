// src/features/workspace/export/lib/exportAll.ts
// export-all utilities — bundle every board into a single JSON, PDF, or
// image ZIP. PDF & ZIP stream each board's bytes into their destination

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import type jsPDFType from 'jspdf'
import type {
  ExportAppearance,
  ImageFormat,
} from '~/features/workspace/export/model/runtime'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import { loadPersistedBoard } from '~/features/workspace/boards/model/boardSession'
import { collectSnapshotExportImageHashes } from '~/shared/lib/boardSnapshotItems'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { snapshotToWireWithBlobs } from '~/shared/board-data/boardWireMapper'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { downloadBlob } from '~/shared/lib/downloadBlob'
import { toFileBase } from '~/shared/lib/fileName'
import { loadPdfLib, loadZipLib } from '~/shared/lib/lazyDependencies'
import { getBlobsBatch } from '~/shared/images/imageStore'
import {
  EXPORT_PIXEL_RATIO,
  IMAGE_FORMAT_META,
} from '~/features/workspace/export/lib/constants'
import { renderToBlob } from '~/features/workspace/export/lib/exportImage'
import { addBoardPageToPdf } from '~/features/workspace/export/lib/exportPdf'
import { withExportSession } from '~/features/workspace/export/lib/exportBoardRender'

// envelope type for multi-board JSON export — each board's `data` is
// self-contained so image-backed items survive import into another browser
interface MultiTierListExport
{
  version: number
  exportedAt: string
  boards: Array<{ title: string; data: BoardSnapshotWire }>
}

// progress callback type used by PDF & image exports
type ProgressCallback = (current: number, total: number) => void

interface BoardEntry
{
  id: string
  title: string
  data: BoardSnapshot
}

// snapshot every board's current data — active board comes from the live
// store, the rest from localStorage. callers don't need to flush the active
// board first because we read it directly from the store
const loadAllBoardData = (): BoardEntry[] =>
{
  const { boards, activeBoardId } = useWorkspaceBoardRegistryStore.getState()
  const activeBoardData = activeBoardId
    ? extractBoardData(useActiveBoardStore.getState())
    : null

  return boards.map((board) => ({
    id: board.id,
    title: board.title,
    data:
      activeBoardId === board.id && activeBoardData
        ? activeBoardData
        : loadPersistedBoard(board.id),
  }))
}

// download all boards as a single self-contained JSON file. shares one IDB
// blob batch across all boards so duplicate hashes are only fetched once
export const exportAllBoardsAsJson = async (): Promise<void> =>
{
  const allBoards = loadAllBoardData()

  // union of hashes referenced across every board, deduplicated
  const allHashes = new Set<string>()
  for (const { data } of allBoards)
  {
    for (const hash of collectSnapshotExportImageHashes(data))
    {
      allHashes.add(hash)
    }
  }

  const records = await getBlobsBatch(Array.from(allHashes))
  const blobsByHash = new Map<string, Blob | null>()
  for (const hash of allHashes)
  {
    blobsByHash.set(hash, records.get(hash)?.bytes ?? null)
  }

  const wireBoards = await Promise.all(
    allBoards.map(async ({ title, data }) => ({
      title,
      data: await snapshotToWireWithBlobs(data, blobsByHash),
    }))
  )

  const payload: MultiTierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    boards: wireBoards,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, 'all-tier-lists.json')
}

// allocate a unique filename base, deduplicating against names already used
// in the same archive
const claimUniqueBase = (title: string, used: Set<string>): string =>
{
  let base = toFileBase(title)
  if (used.has(base))
  {
    let n = 2
    while (used.has(`${base}-${n}`)) n++
    base = `${base}-${n}`
  }
  used.add(base)
  return base
}

// download all boards as a multi-page PDF — renders each board, embeds the
// PNG bytes immediately, then drops them before moving to the next board
export const exportAllBoardsAsPdf = async (
  appearance: ExportAppearance,
  backgroundColor: string,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const allBoards = loadAllBoardData()
  if (allBoards.length === 0) return

  const { jsPDF } = await loadPdfLib()

  // build the PDF inside the session closure & return it — keeping the
  // mutable doc local to the closure lets TS narrow it cleanly
  const pdf = await withExportSession(
    { appearance, backgroundColor },
    async (session) =>
    {
      let doc: jsPDFType | null = null

      for (let i = 0; i < allBoards.length; i++)
      {
        const board = allBoards[i]
        const element = await session.renderBoard(board.data)
        const width = element.offsetWidth * EXPORT_PIXEL_RATIO
        const height = element.offsetHeight * EXPORT_PIXEL_RATIO

        const blob = await renderToBlob(element, 'png', backgroundColor)
        doc = await addBoardPageToPdf(doc, jsPDF, { blob, width, height })

        onProgress?.(i + 1, allBoards.length)
      }

      return doc
    }
  )

  pdf?.save('all-tier-lists.pdf')
}

// download all boards as a ZIP of images — streams each rendered blob into
// JSZip without ever allocating a per-board data URL
export const exportAllBoardsAsImages = async (
  appearance: ExportAppearance,
  format: ImageFormat,
  backgroundColor: string,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const allBoards = loadAllBoardData()
  if (allBoards.length === 0) return

  const JSZip = await loadZipLib()
  const zip = new JSZip()
  const ext = IMAGE_FORMAT_META[format].ext
  const usedNames = new Set<string>()

  await withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    for (let i = 0; i < allBoards.length; i++)
    {
      const board = allBoards[i]
      const element = await session.renderBoard(board.data)
      const blob = await renderToBlob(element, format, backgroundColor)
      const base = claimUniqueBase(board.title, usedNames)

      zip.file(`${base}.${ext}`, blob)
      onProgress?.(i + 1, allBoards.length)
    }
  })

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, 'all-tier-lists.zip')
}
