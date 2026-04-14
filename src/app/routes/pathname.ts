// src/app/routes/pathname.ts
// app route parsing helpers for workspace & embed shells

export type AppRoute =
  | { kind: 'workspace' }
  | { kind: 'embed' }
  | { kind: 'not-found'; pathname: string }

export const EMBED_ROUTE_PATH = '/embed'

export const normalizeBasePath = (): string =>
{
  const baseUrl = import.meta.env.BASE_URL || '/'

  if (baseUrl === '/')
  {
    return ''
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

export const getWorkspacePath = (): string =>
{
  const basePath = normalizeBasePath()
  return basePath || '/'
}

export const getEmbedPath = (): string =>
{
  const basePath = normalizeBasePath()
  return `${basePath}${EMBED_ROUTE_PATH}`
}

const stripBasePath = (pathname: string): string =>
{
  const basePath = normalizeBasePath()

  if (!basePath)
  {
    return pathname || '/'
  }

  if (pathname === basePath)
  {
    return '/'
  }

  if (pathname.startsWith(`${basePath}/`))
  {
    return pathname.slice(basePath.length) || '/'
  }

  return pathname || '/'
}

export const resolveAppRoute = (pathname: string): AppRoute =>
{
  const relativePathname = stripBasePath(pathname)

  if (relativePathname === '/' || relativePathname === '')
  {
    return { kind: 'workspace' }
  }

  if (relativePathname === EMBED_ROUTE_PATH)
  {
    return { kind: 'embed' }
  }

  return {
    kind: 'not-found',
    pathname: relativePathname,
  }
}
