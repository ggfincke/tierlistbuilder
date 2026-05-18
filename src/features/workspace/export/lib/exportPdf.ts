// src/features/workspace/export/lib/exportPdf.ts
// PDF export utility — renders the tier list to PNG bytes & embeds them in
// a pixel-perfect PDF for download

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '~/features/workspace/export/model/runtime'
import { toFileBase } from '~/shared/lib/fileName'
import { loadPdfLib } from '~/shared/lib/lazyDependencies'
import { captureBoardAsBlob } from '~/features/workspace/export/lib/exportImage'

// capture the board as a PNG, embed the bytes in a single-page PDF, & download
export const exportTierListAsPdf = async (
  data: BoardSnapshot,
  title: string,
  appearance: ExportAppearance,
  backgroundColor: string
): Promise<void> =>
{
  const { blob, width, height } = await captureBoardAsBlob(data, {
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

  const bytes = new Uint8Array(await blob.arrayBuffer())
  pdf.addImage(bytes, 'PNG', 0, 0, width, height)
  pdf.save(`${toFileBase(title)}.pdf`)
}
