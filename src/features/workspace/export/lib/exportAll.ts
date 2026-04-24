// src/features/workspace/export/lib/exportAll.ts
// export-all utilities — bundle every board into a single JSON, PDF, or image ZIP

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance, ImageFormat } from '../model/runtime'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  loadPersistedBoard,
  saveActiveBoardSnapshot,
} from '~/features/workspace/boards/model/boardSession'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toFileBase } from '~/shared/lib/fileName'
import { dataUrlToBytes } from '~/shared/lib/binaryCodec'
import { downloadBlob } from '~/shared/lib/downloadBlob'
import { EXPORT_BACKGROUND_COLOR, EXPORT_PIXEL_RATIO } from './constants'
import { FORMAT_EXT, renderToDataUrl } from './exportImage'
import { withExportSession } from './exportBoardRender'
import { snapshotToWire } from './boardWireMapper'
import { warmFromBoard } from '~/shared/images/imageBlobCache'

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

// load every board's data from localStorage (flushes active board first)
const loadAllBoardData = (): Array<{
  id: string
  title: string
  data: BoardSnapshot
}> =>
{
  const { boards, activeBoardId } = useWorkspaceBoardRegistryStore.getState()

  saveActiveBoardSnapshot()

  const activeBoardData = activeBoardId
    ? extractBoardData(useActiveBoardStore.getState())
    : null
  const results: Array<{ id: string; title: string; data: BoardSnapshot }> = []
  for (const board of boards)
  {
    const data =
      activeBoardId === board.id && activeBoardData
        ? activeBoardData
        : loadPersistedBoard(board.id)
    results.push({ id: board.id, title: board.title, data })
  }
  return results
}

// prewarm the shared image blob cache so the off-screen render tree resolves
// every imageRef -> object URL synchronously through useImageUrl
const prepareBoardsForCapture = async (
  boards: Array<{ id: string; title: string; data: BoardSnapshot }>
): Promise<void> =>
{
  await Promise.all(boards.map(({ data }) => warmFromBoard(data)))
}

// download all boards as a single self-contained JSON file
export const exportAllBoardsAsJson = async (): Promise<void> =>
{
  const allBoards = loadAllBoardData()

  const wireBoards = await Promise.all(
    allBoards.map(async ({ title, data }) => ({
      title,
      data: await snapshotToWire(data),
    }))
  )

  const payload: MultiTierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    boards: wireBoards,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, 'all-tier-lists.json')
}

// render each board inside a hidden off-screen export session, never touching
// the live board store or DOM
const captureAllBoards = async (
  appearance: ExportAppearance,
  format: ImageFormat,
  backgroundColor: string,
  onProgress?: ProgressCallback
): Promise<
  Array<{ title: string; dataUrl: string; width: number; height: number }>
> =>
{
  const allBoards = loadAllBoardData()
  await prepareBoardsForCapture(allBoards)

  return await withExportSession(
    { appearance, backgroundColor },
    async (session) =>
    {
      const captures: Array<{
        title: string
        dataUrl: string
        width: number
        height: number
      }> = []

      for (let i = 0; i < allBoards.length; i++)
      {
        const board = allBoards[i]
        const element = await session.renderBoard(board.data)
        const dataUrl = await renderToDataUrl(element, format, backgroundColor)

        captures.push({
          title: board.title,
          dataUrl,
          width: element.offsetWidth * EXPORT_PIXEL_RATIO,
          height: element.offsetHeight * EXPORT_PIXEL_RATIO,
        })

        onProgress?.(i + 1, allBoards.length)
      }

      return captures
    }
  )
}

// download all boards as a multi-page PDF (one page per board)
export const exportAllBoardsAsPdf = async (
  appearance: ExportAppearance,
  backgroundColor = EXPORT_BACKGROUND_COLOR,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const captures = await captureAllBoards(
    appearance,
    'png',
    backgroundColor,
    onProgress
  )

  if (captures.length === 0) return

  const { jsPDF } = await import('jspdf')

  // build multi-page PDF
  const first = captures[0]
  const orientation = first.width >= first.height ? 'landscape' : 'portrait'

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [first.width, first.height],
  })
  pdf.addImage(first.dataUrl, 'PNG', 0, 0, first.width, first.height)

  for (let i = 1; i < captures.length; i++)
  {
    const cap = captures[i]
    const orient = cap.width >= cap.height ? 'landscape' : 'portrait'
    pdf.addPage([cap.width, cap.height], orient)
    pdf.addImage(cap.dataUrl, 'PNG', 0, 0, cap.width, cap.height)
  }

  pdf.save('all-tier-lists.pdf')
}

// download all boards as a ZIP of images (one per board)
export const exportAllBoardsAsImages = async (
  appearance: ExportAppearance,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const captures = await captureAllBoards(
    appearance,
    format,
    backgroundColor,
    onProgress
  )

  if (captures.length === 0) return

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const ext = FORMAT_EXT[format]
  // track filenames to avoid collisions
  const usedNames = new Set<string>()

  for (const cap of captures)
  {
    let base = toFileBase(cap.title)
    // deduplicate filenames
    if (usedNames.has(base))
    {
      let n = 2
      while (usedNames.has(`${base}-${n}`)) n++
      base = `${base}-${n}`
    }
    usedNames.add(base)

    zip.file(`${base}.${ext}`, dataUrlToBytes(cap.dataUrl))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, 'all-tier-lists.zip')
}
