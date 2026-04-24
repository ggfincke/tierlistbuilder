// src/features/workspace/export/lib/exportPdf.ts
// PDF export utility — renders the tier list element to a downloadable PDF

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '../model/runtime'
import { toFileBase } from '~/shared/lib/fileName'
import { loadPdfLib } from '~/shared/lib/lazyDependencies'
import { captureBoardAsDataUrl } from './exportImage'

// capture the element as a PNG then embed it in a pixel-perfect PDF & download
export const exportTierListAsPdf = async (
  data: BoardSnapshot,
  title: string,
  appearance: ExportAppearance,
  backgroundColor?: string
): Promise<void> =>
{
  const { dataUrl, width, height } = await captureBoardAsDataUrl(data, {
    appearance,
    backgroundColor,
    format: 'png',
  })
  // choose orientation based on image aspect ratio
  const orientation = width >= height ? 'landscape' : 'portrait'

  const { jsPDF } = await loadPdfLib()

  // create a PDF sized to the exact pixel dimensions of the rendered image
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
  })

  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)
  pdf.save(`${toFileBase(title)}.pdf`)
}
