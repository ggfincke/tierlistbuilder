// src/features/workspace/export/lib/exportAll.ts
// export-all utilities — bundle every board into a single JSON, PDF, or image ZIP

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance, ImageFormat } from '@/shared/types/export'
import { BOARD_DATA_VERSION } from '@/features/workspace/boards/data/local/boardStorage'
import {
  loadPersistedBoard,
  saveActiveBoardSnapshot,
} from '@/features/workspace/boards/data/local/localBoardSession'
import { useWorkspaceBoardRegistryStore } from '@/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toFileBase } from '@/shared/lib/fileName'
import { EXPORT_BACKGROUND_COLOR, EXPORT_PIXEL_RATIO } from './constants'
import { FORMAT_EXT, renderToDataUrl, triggerDownload } from './exportImage'
import { withExportSession } from './exportBoardRender'

// convert a data URL to raw bytes for ZIP packaging
// handles both base64 (raster) & URL-encoded (SVG) data URLs
const dataUrlToZipEntry = (dataUrl: string): Uint8Array | string =>
{
  // SVG data URLs are URL-encoded text, not base64
  if (dataUrl.startsWith('data:image/svg+xml'))
  {
    const raw = dataUrl.split(',')[1]
    return decodeURIComponent(raw)
  }

  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
  {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// envelope type for multi-board JSON export
interface MultiTierListExport
{
  version: number
  exportedAt: string
  boards: Array<{ title: string; data: BoardSnapshot }>
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
  const { boards } = useWorkspaceBoardRegistryStore.getState()

  saveActiveBoardSnapshot()

  const results: Array<{ id: string; title: string; data: BoardSnapshot }> = []
  for (const board of boards)
  {
    const data = loadPersistedBoard(board.id)
    results.push({ id: board.id, title: board.title, data })
  }
  return results
}

// download all boards as a single JSON file
export const exportAllBoardsAsJson = () =>
{
  const allBoards = loadAllBoardData()

  const payload: MultiTierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    boards: allBoards.map(({ title, data }) => ({ title, data })),
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, 'all-tier-lists.json')
  URL.revokeObjectURL(url)
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

  return withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    const captures: Array<{
      title: string
      dataUrl: string
      width: number
      height: number
    }> = []

    for (let i = 0; i < allBoards.length; i++)
    {
      const element = await session.renderBoard(allBoards[i].data)

      const dataUrl = await renderToDataUrl(element, format, backgroundColor)

      captures.push({
        title: allBoards[i].title,
        dataUrl,
        width: element.offsetWidth * EXPORT_PIXEL_RATIO,
        height: element.offsetHeight * EXPORT_PIXEL_RATIO,
      })

      onProgress?.(i + 1, allBoards.length)
    }

    return captures
  })
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

  // dynamically import jsPDF to keep the main bundle slim
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

  // dynamically import jszip to keep the main bundle slim
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

    zip.file(`${base}.${ext}`, dataUrlToZipEntry(cap.dataUrl))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, 'all-tier-lists.zip')
  URL.revokeObjectURL(url)
}
