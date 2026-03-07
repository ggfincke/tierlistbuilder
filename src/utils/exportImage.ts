// src/utils/exportImage.ts
// PNG export utility — renders the tier list element to a downloadable image
import { toPng } from 'html-to-image'
import { EXPORT_BACKGROUND_COLOR, toFileBase } from './constants'

// trigger a browser download for a data URL w/ the given filename
const downloadDataUrl = (dataUrl: string, filename: string) => {
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = dataUrl
  anchor.click()
}

// render the element to a 2x PNG data URL w/ consistent export settings
export const renderElementToPng = (element: HTMLElement): Promise<string> =>
  toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: EXPORT_BACKGROUND_COLOR,
  })

// capture the element as a 2x PNG & download it
export const exportTierListAsPng = async (
  element: HTMLElement,
  title: string,
): Promise<void> => {
  const png = await renderElementToPng(element)

  downloadDataUrl(png, `${toFileBase(title)}.png`)
}
