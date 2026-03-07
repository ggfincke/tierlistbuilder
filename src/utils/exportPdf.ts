// src/utils/exportPdf.ts
// PDF export utility — renders the tier list element to a downloadable PDF
import { jsPDF } from 'jspdf'
import { toFileBase } from './constants'
import { renderElementToPng } from './exportImage'

// capture the element as a PNG then embed it in a pixel-perfect PDF & download
export const exportTierListAsPdf = async (
  element: HTMLElement,
  title: string,
): Promise<void> => {
  const pixelRatio = 2
  const png = await renderElementToPng(element)

  // derive pixel dimensions from the source element & known pixel ratio
  const width = element.offsetWidth * pixelRatio
  const height = element.offsetHeight * pixelRatio
  // choose orientation based on image aspect ratio
  const orientation = width >= height ? 'landscape' : 'portrait'

  // create a PDF sized to the exact pixel dimensions of the rendered image
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
  })

  // embed the PNG & save the file
  pdf.addImage(png, 'PNG', 0, 0, width, height)
  pdf.save(`${toFileBase(title)}.pdf`)
}
