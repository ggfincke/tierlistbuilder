// src/features/workspace/export/lib/exportPdf.ts
// PDF export utility — renders the tier list to PNG bytes & embeds them in
// a pixel-perfect PDF for download

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type jsPDFType from 'jspdf'
import type { ExportAppearance } from '~/features/workspace/export/model/runtime'
import { toFileBase } from '~/shared/lib/fileName'
import { loadPdfLib } from '~/shared/lib/lazyDependencies'
import { captureBoardAsBlob } from '~/features/workspace/export/lib/exportImage'

type PdfConstructor = (typeof import('jspdf'))['jsPDF']

interface BoardPdfPage
{
  blob: Blob
  width: number
  height: number
}

export const addBoardPageToPdf = async (
  doc: jsPDFType | null,
  jsPDF: PdfConstructor,
  { blob, width, height }: BoardPdfPage
): Promise<jsPDFType> =>
{
  const orientation = width >= height ? 'landscape' : 'portrait'
  const pdf =
    doc ??
    new jsPDF({
      orientation,
      unit: 'px',
      format: [width, height],
    })

  if (doc !== null)
  {
    pdf.addPage([width, height], orientation)
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  pdf.addImage(bytes, 'PNG', 0, 0, width, height)
  return pdf
}

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

  const { jsPDF } = await loadPdfLib()
  const pdf = await addBoardPageToPdf(null, jsPDF, { blob, width, height })
  pdf.save(`${toFileBase(title)}.pdf`)
}
