// src/utils/exportAll.ts
// export-all utilities — bundle every board into a single JSON, PDF, or image ZIP

import type { ImageFormat, TierListData } from '../types'
import {
  loadAllBoardData,
  setExportLock,
  useBoardManagerStore,
} from '../store/useBoardManagerStore'
import { useTierListStore } from '../store/useTierListStore'
import { EXPORT_BACKGROUND_COLOR, toFileBase } from './constants'
import {
  FORMAT_EXT,
  renderToDataUrl,
  triggerDownload,
} from './exportImage'


// wait for React to paint & layout to settle after a store update
const waitForRender = (): Promise<void> =>
  new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setTimeout(resolve, 50))
    )
  )

// convert a base64 data URL to a Uint8Array for ZIP packaging
const dataUrlToUint8Array = (dataUrl: string): Uint8Array =>
{
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
  boards: Array<{ title: string; data: TierListData }>
}

// progress callback type used by PDF & image exports
type ProgressCallback = (current: number, total: number) => void

// download all boards as a single JSON file
export const exportAllBoardsAsJson = () =>
{
  const allBoards = loadAllBoardData()

  const payload: MultiTierListExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    boards: allBoards.map(({ title, data }) => ({ title, data })),
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, 'all-tier-lists.json')
  URL.revokeObjectURL(url)
}

// render each board by temporarily swapping it into the store, capturing the DOM,
// then restoring the original board
const captureAllBoards = async (
  element: HTMLElement,
  format: ImageFormat,
  backgroundColor: string,
  onProgress?: ProgressCallback
): Promise<
  Array<{ title: string; dataUrl: string; width: number; height: number }>
> =>
{
  const originalActiveBoardId =
    useBoardManagerStore.getState().activeBoardId
  const allBoards = loadAllBoardData()
  const { loadBoard } = useTierListStore.getState()
  const pixelRatio = 2

  const captures: Array<{
    title: string
    dataUrl: string
    width: number
    height: number
  }> = []

  setExportLock(true)
  try
  {
    for (let i = 0; i < allBoards.length; i++)
    {
      // swap board into the store & wait for React to paint
      loadBoard(allBoards[i].data)
      await waitForRender()

      const dataUrl = await renderToDataUrl(element, format, backgroundColor)

      captures.push({
        title: allBoards[i].title,
        dataUrl,
        width: element.offsetWidth * pixelRatio,
        height: element.offsetHeight * pixelRatio,
      })

      onProgress?.(i + 1, allBoards.length)
    }
  }
  finally
  {
    // always restore the original active board, even if capture threw
    const original = allBoards.find((b) => b.id === originalActiveBoardId)
    if (original)
    {
      loadBoard(original.data)
      await waitForRender()
    }
    setExportLock(false)
  }

  return captures
}

// download all boards as a multi-page PDF (one page per board)
export const exportAllBoardsAsPdf = async (
  element: HTMLElement,
  backgroundColor = EXPORT_BACKGROUND_COLOR,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const captures = await captureAllBoards(
    element,
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
  element: HTMLElement,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR,
  onProgress?: ProgressCallback
): Promise<void> =>
{
  const captures = await captureAllBoards(
    element,
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

    zip.file(`${base}.${ext}`, dataUrlToUint8Array(cap.dataUrl))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, 'all-tier-lists.zip')
  URL.revokeObjectURL(url)
}
