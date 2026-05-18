// src/features/workspace/export/lib/exportImage.ts
// image export utilities — render the tier list to PNG, JPEG, WebP, or SVG
// for download & clipboard

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance, ImageFormat } from '~/features/workspace/export/model/runtime'
import { dataUrlToBytes } from '~/shared/lib/binaryCodec'
import { downloadBlob } from '~/shared/lib/downloadBlob'
import { toFileBase } from '~/shared/lib/fileName'
import { loadHtmlToImageLib } from '~/shared/lib/lazyDependencies'
import {
  EXPORT_PIXEL_RATIO,
  IMAGE_FORMAT_META,
  IMAGE_QUALITY,
} from '~/features/workspace/export/lib/constants'
import { withExportSession } from '~/features/workspace/export/lib/exportBoardRender'

// build the html-to-image options for a given background color
const buildImageOptions = (backgroundColor: string) => ({
  pixelRatio: EXPORT_PIXEL_RATIO,
  backgroundColor,
})

// render an element to a data URL -- used by preview & annotate flows that
// need an inline `src=` for an <img>. download/PDF/ZIP flows should use
// `renderToBlob` instead so we never pay the base64 round-trip
export const renderToDataUrl = async (
  element: HTMLElement,
  format: ImageFormat,
  backgroundColor: string
): Promise<string> =>
{
  const opts = buildImageOptions(backgroundColor)
  const { toCanvas, toJpeg, toPng, toSvg } = await loadHtmlToImageLib()

  if (format === 'svg') return toSvg(element, opts)
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

// render an element directly to a Blob — used for downloads, PDF embedding,
// & ZIP packaging. avoids the data-URL -> base64 round-trip in those flows
export const renderToBlob = async (
  element: HTMLElement,
  format: ImageFormat,
  backgroundColor: string
): Promise<Blob> =>
{
  const opts = buildImageOptions(backgroundColor)
  const lib = await loadHtmlToImageLib()

  if (format === 'svg')
  {
    // toSvg returns a percent-encoded data URL; decode & wrap as a Blob.
    // BlobPart cast mirrors imagePersistence.ts (TS strict-ArrayBuffer)
    const dataUrl = await lib.toSvg(element, opts)
    const bytes = dataUrlToBytes(dataUrl)
    return new Blob([bytes as unknown as BlobPart], {
      type: IMAGE_FORMAT_META.svg.mimeType,
    })
  }

  if (format === 'png')
  {
    const blob = await lib.toBlob(element, opts)
    if (!blob) throw new Error('Failed to render PNG image.')
    return blob
  }

  // jpeg & webp: render to a canvas then encode via canvas.toBlob
  const canvas = await lib.toCanvas(element, opts)
  const mime = IMAGE_FORMAT_META[format].mimeType
  return await new Promise<Blob>((resolve, reject) =>
  {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error(`Failed to render ${format} image.`)),
      mime,
      IMAGE_QUALITY
    )
  })
}

interface CapturedBoardImage
{
  blob: Blob
  // source element pixel dimensions scaled by the export pixel ratio; PDF
  // callers size pages against these, image callers can ignore them
  width: number
  height: number
}

interface CaptureBoardOptions
{
  appearance: ExportAppearance
  backgroundColor: string
  format: ImageFormat
}

// capture a single board to a Blob inside an isolated export session.
// for batch capture (all boards) the loop in exportAll keeps one session
// open across boards to avoid re-mounting the hidden host
export const captureBoardAsBlob = async (
  data: BoardSnapshot,
  { appearance, backgroundColor, format }: CaptureBoardOptions
): Promise<CapturedBoardImage> =>
  withExportSession({ appearance, backgroundColor }, async (session) =>
  {
    const element = await session.renderBoard(data)
    const blob = await renderToBlob(element, format, backgroundColor)
    return {
      blob,
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
  backgroundColor: string
): Promise<void> =>
{
  const { blob } = await captureBoardAsBlob(data, {
    appearance,
    backgroundColor,
    format,
  })
  downloadBlob(blob, `${toFileBase(title)}.${IMAGE_FORMAT_META[format].ext}`)
}

// render the board as PNG & copy it to the system clipboard
export const copyBoardToClipboard = async (
  data: BoardSnapshot,
  appearance: ExportAppearance,
  backgroundColor: string
): Promise<void> =>
{
  if (!('ClipboardItem' in window))
  {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const { blob } = await captureBoardAsBlob(data, {
    appearance,
    backgroundColor,
    format: 'png',
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
