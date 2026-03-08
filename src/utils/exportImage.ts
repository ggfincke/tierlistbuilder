// src/utils/exportImage.ts
// image export utilities — render the tier list to PNG, JPEG, or WebP for download & clipboard
import { toBlob, toCanvas, toJpeg, toPng } from 'html-to-image'

import type { ImageFormat } from '../types'
import { EXPORT_BACKGROUND_COLOR, toFileBase } from './constants'

// quality setting used for JPEG & WebP encoding
const IMAGE_QUALITY = 0.92

// trigger a browser download for a data URL w/ the given filename
const downloadDataUrl = (dataUrl: string, filename: string) => {
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = dataUrl
  anchor.click()
}

// shared export options for consistent rendering across all formats
const baseOptions = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: EXPORT_BACKGROUND_COLOR,
}

// render functions keyed by format — each returns a data URL
const renderFns: Record<ImageFormat, (el: HTMLElement) => Promise<string>> = {
  png: (el) => toPng(el, baseOptions),
  jpeg: (el) => toJpeg(el, { ...baseOptions, quality: IMAGE_QUALITY }),
  webp: async (el) => {
    const canvas = await toCanvas(el, baseOptions)
    return canvas.toDataURL('image/webp', IMAGE_QUALITY)
  },
}

// file extensions keyed by format
const FORMAT_EXT: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpeg', webp: 'webp' }

// render the element to a 2x PNG data URL (used by PDF export)
export const renderElementToPng = (element: HTMLElement): Promise<string> =>
  renderFns.png(element)

// render the element as PNG & copy it to the system clipboard
export const copyTierListToClipboard = async (
  element: HTMLElement,
): Promise<void> => {
  if (!('ClipboardItem' in window)) {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const blob = await toBlob(element, baseOptions)
  if (!blob) {
    throw new Error('Failed to render image for clipboard.')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

// download the tier list as the specified image format
export const exportTierListAsImage = async (
  element: HTMLElement,
  title: string,
  format: ImageFormat,
): Promise<void> => {
  const dataUrl = await renderFns[format](element)
  downloadDataUrl(dataUrl, `${toFileBase(title)}.${FORMAT_EXT[format]}`)
}
