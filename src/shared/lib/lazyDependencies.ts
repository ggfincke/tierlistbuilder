// src/shared/lib/lazyDependencies.ts
// memoized loaders for large optional runtime dependencies

type CompressionModule = typeof import('pako')
type HtmlToImageModule = typeof import('html-to-image')
type PdfModule = typeof import('jspdf')
type ZipConstructor = typeof import('jszip')

const createLazyModuleLoader = <T>(
  load: () => Promise<T>
): (() => Promise<T>) =>
{
  let promise: Promise<T> | null = null
  return () =>
  {
    promise ??= load().catch((error) =>
    {
      promise = null
      throw error
    })
    return promise
  }
}

const preloadOptionalLib = <T>(loader: () => Promise<T>): void =>
{
  if (typeof window === 'undefined') return
  void loader().catch(() => undefined)
}

export const loadCompressionLib = createLazyModuleLoader<CompressionModule>(
  () => import('pako')
)

export const loadPdfLib = createLazyModuleLoader<PdfModule>(
  () => import('jspdf')
)

export const loadHtmlToImageLib = createLazyModuleLoader<HtmlToImageModule>(
  () => import('html-to-image')
)

export const loadZipLib = createLazyModuleLoader<ZipConstructor>(() =>
  import('jszip').then((module) => module.default)
)

export const preloadHtmlToImageLib = (): void =>
  preloadOptionalLib(loadHtmlToImageLib)

export const preloadPdfLib = (): void => preloadOptionalLib(loadPdfLib)

export const preloadZipLib = (): void => preloadOptionalLib(loadZipLib)
