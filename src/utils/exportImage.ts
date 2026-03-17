// src/utils/exportImage.ts
// image export utilities — render the tier list to PNG, JPEG, or WebP for download & clipboard

import { toBlob, toCanvas, toJpeg, toPng } from 'html-to-image'

import type { ImageFormat } from '../types'
import { EXPORT_BACKGROUND_COLOR, toFileBase } from './constants'

// quality setting used for JPEG & WebP encoding
const IMAGE_QUALITY = 0.92

// trigger a browser download for any URL (data URL or blob URL) w/ the given filename
export const triggerDownload = (url: string, filename: string) =>
{
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  anchor.click()
}

// build export options for a given background color
const getBaseOptions = (bgColor: string) => ({
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: bgColor,
})

// file extensions keyed by format
const FORMAT_EXT: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpeg',
  webp: 'webp',
}

// render the element to a 2x PNG data URL (used by PDF export)
export const renderElementToPng = (
  element: HTMLElement,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<string> => toPng(element, getBaseOptions(backgroundColor))

// render the element as PNG & copy it to the system clipboard
export const copyTierListToClipboard = async (
  element: HTMLElement,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
{
  if (!('ClipboardItem' in window))
  {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const blob = await toBlob(element, getBaseOptions(backgroundColor))
  if (!blob)
  {
    throw new Error('Failed to render image for clipboard.')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

// download the tier list as the specified image format
export const exportTierListAsImage = async (
  element: HTMLElement,
  title: string,
  format: ImageFormat,
  backgroundColor = EXPORT_BACKGROUND_COLOR
): Promise<void> =>
{
  const opts = getBaseOptions(backgroundColor)

  const renderFns: Record<ImageFormat, () => Promise<string>> = {
    png: () => toPng(element, opts),
    jpeg: () => toJpeg(element, { ...opts, quality: IMAGE_QUALITY }),
    webp: async () =>
    {
      const canvas = await toCanvas(element, opts)
      return canvas.toDataURL('image/webp', IMAGE_QUALITY)
    },
  }

  const dataUrl = await renderFns[format]()
  triggerDownload(dataUrl, `${toFileBase(title)}.${FORMAT_EXT[format]}`)
}
