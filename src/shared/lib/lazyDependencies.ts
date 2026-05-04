// src/shared/lib/lazyDependencies.ts
// memoized loaders for large optional runtime dependencies

type CompressionModule = typeof import('pako')
type HtmlToImageModule = typeof import('html-to-image')
type PdfModule = typeof import('jspdf')
type ZipConstructor = typeof import('jszip')

let compressionPromise: Promise<CompressionModule> | null = null
let htmlToImagePromise: Promise<HtmlToImageModule> | null = null
let pdfPromise: Promise<PdfModule> | null = null
let zipPromise: Promise<ZipConstructor> | null = null

const preloadOptionalLib = <T>(loader: () => Promise<T>): void =>
{
  if (typeof window === 'undefined') return
  void loader().catch(() => undefined)
}

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

export const loadHtmlToImageLib = (): Promise<HtmlToImageModule> =>
{
  htmlToImagePromise ??= import('html-to-image').catch((error) =>
  {
    htmlToImagePromise = null
    throw error
  })
  return htmlToImagePromise
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

export const preloadHtmlToImageLib = (): void =>
  preloadOptionalLib(loadHtmlToImageLib)

export const preloadPdfLib = (): void => preloadOptionalLib(loadPdfLib)

export const preloadZipLib = (): void => preloadOptionalLib(loadZipLib)
