// src/shared/lib/lazyDependencies.ts
// memoized loaders for large optional runtime dependencies

type CompressionModule = typeof import('pako')
type PdfModule = typeof import('jspdf')
type ZipConstructor = typeof import('jszip')

let compressionPromise: Promise<CompressionModule> | null = null
let pdfPromise: Promise<PdfModule> | null = null
let zipPromise: Promise<ZipConstructor> | null = null

export const loadCompressionLib = (): Promise<CompressionModule> =>
{
  compressionPromise ??= import('pako').catch((error) =>
  {
    compressionPromise = null
    throw error
  })
  return compressionPromise
}

export const loadPdfLib = (): Promise<PdfModule> =>
{
  pdfPromise ??= import('jspdf').catch((error) =>
  {
    pdfPromise = null
    throw error
  })
  return pdfPromise
}

export const loadZipLib = (): Promise<ZipConstructor> =>
{
  zipPromise ??= import('jszip')
    .then((module) => module.default)
    .catch((error) =>
    {
      zipPromise = null
      throw error
    })
  return zipPromise
}
