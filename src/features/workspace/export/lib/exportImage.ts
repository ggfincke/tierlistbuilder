// src/features/workspace/export/lib/exportImage.ts
// image export utilities — render the tier list to PNG, JPEG, or WebP for download & clipboard

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance, ImageFormat } from '../model/runtime'
import { toFileBase } from '~/shared/lib/fileName'
import { triggerDownload } from '~/shared/lib/downloadBlob'
import { loadHtmlToImageLib } from '~/shared/lib/lazyDependencies'
import { EXPORT_BACKGROUND_COLOR, EXPORT_PIXEL_RATIO } from './constants'
import { withExportSession } from './exportBoardRender'

// quality setting used for JPEG & WebP encoding
export const IMAGE_QUALITY = 0.92

// build export options for a given background color
export const getBaseOptions = (bgColor: string) => ({
  pixelRatio: EXPORT_PIXEL_RATIO,
  cacheBust: true,
  backgroundColor: bgColor,
})

// file extensions keyed by format
export const FORMAT_EXT: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpeg',
  webp: 'webp',
  svg: 'svg',
}

// render an element to a data URL in the specified format
export const renderToDataUrl = async (
  element: HTMLElement,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<string> =>
{
  const opts = getBaseOptions(backgroundColor)
  const { toCanvas, toJpeg, toPng, toSvg } = await loadHtmlToImageLib()

  if (format === 'svg')
  {
    return toSvg(element, opts)
  }
  if (format === 'jpeg')
  {
    return toJpeg(element, { ...opts, quality: IMAGE_QUALITY })
  }
  if (format === 'webp')
  {
    const canvas = await toCanvas(element, opts)
    return canvas.toDataURL('image/webp', IMAGE_QUALITY)
  }
  return toPng(element, opts)
}

// render the element to a 2x PNG data URL
export const renderElementToPng = async (
  element: HTMLElement,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<string> =>
{
  const { toPng } = await loadHtmlToImageLib()
  return toPng(element, getBaseOptions(backgroundColor))
}

export interface CapturedBoardImage
{
  dataUrl: string
  // source element pixel dimensions scaled by the export pixel ratio; PDF
  // callers size pages against these, image callers can ignore them
  width: number
  height: number
}

interface CaptureBoardOptions
{
  appearance: ExportAppearance
  backgroundColor?: string
  format: ImageFormat
}

// capture a single board as a data URL inside an isolated export session.
// for batch capture (all boards) use captureAllBoards in exportAll.ts which
// keeps one session open across boards to avoid re-mounting the hidden host
export const captureBoardAsDataUrl = async (
  data: BoardSnapshot,
  {
    appearance,
    backgroundColor = EXPORT_BACKGROUND_COLOR,
    format,
  }: CaptureBoardOptions
): Promise<CapturedBoardImage> =>
  withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    const element = await session.renderBoard(data)
    const dataUrl = await renderToDataUrl(element, format, backgroundColor)
    return {
      dataUrl,
      width: element.offsetWidth * EXPORT_PIXEL_RATIO,
      height: element.offsetHeight * EXPORT_PIXEL_RATIO,
    }
  })

// download the tier list as the specified image format
export const exportTierListAsImage = async (
  data: BoardSnapshot,
  title: string,
  appearance: ExportAppearance,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
{
  const { dataUrl } = await captureBoardAsDataUrl(data, {
    appearance,
    backgroundColor,
    format,
  })
  triggerDownload(dataUrl, `${toFileBase(title)}.${FORMAT_EXT[format]}`)
}

// render the board as PNG & copy it to the system clipboard
export const copyBoardToClipboard = async (
  data: BoardSnapshot,
  appearance: ExportAppearance,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
{
  if (!('ClipboardItem' in window))
  {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const { toBlob } = await loadHtmlToImageLib()

  await withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    const element = await session.renderBoard(data)
    const blob = await toBlob(element, getBaseOptions(backgroundColor))
    if (!blob)
    {
      throw new Error('Failed to render image for clipboard.')
    }

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  })
}
