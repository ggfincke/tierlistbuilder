// src/utils/exportImage.ts
// image export utilities — render the tier list to PNG, JPEG, or WebP for download & clipboard

import { toBlob, toCanvas, toJpeg, toPng, toSvg } from 'html-to-image'

import type { ExportAppearance, ImageFormat, TierListData } from '../types'
import { EXPORT_BACKGROUND_COLOR, toFileBase } from './constants'
import { withExportSession } from './exportBoardRender'

// quality setting used for JPEG & WebP encoding
export const IMAGE_QUALITY = 0.92

// trigger a browser download for any URL (data URL or blob URL) w/ the given filename
export const triggerDownload = (url: string, filename: string) =>
{
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  anchor.click()
}

// build export options for a given background color
export const getBaseOptions = (bgColor: string) => ({
  pixelRatio: 2,
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

// render the element to a 2x PNG data URL (used by PDF export)
export const renderElementToPng = (
  element: HTMLElement,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<string> => toPng(element, getBaseOptions(backgroundColor))

// download the tier list as the specified image format
export const exportTierListAsImage = async (
  data: TierListData,
  title: string,
  appearance: ExportAppearance,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
  withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    const element = await session.renderBoard(data)
    const dataUrl = await renderToDataUrl(element, format, backgroundColor)
    triggerDownload(dataUrl, `${toFileBase(title)}.${FORMAT_EXT[format]}`)
  })

// render the board as PNG & copy it to the system clipboard
export const copyBoardToClipboard = async (
  data: TierListData,
  appearance: ExportAppearance,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
{
  if (!('ClipboardItem' in window))
  {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

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
