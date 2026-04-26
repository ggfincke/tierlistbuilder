// src/app/routes/pathname.ts
// app route path helpers — base-path-aware URL builders for non-React callers
// (share-link composers etc); React components should use react-router hooks

export const EMBED_ROUTE_PATH = '/embed'
export const TEMPLATES_ROUTE_PATH = '/templates'
export const BOARDS_ROUTE_PATH = '/boards'

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

export const getTemplatesPath = (): string =>
{
  const basePath = normalizeBasePath()
  return `${basePath}${TEMPLATES_ROUTE_PATH}`
}

export const getBoardsPath = (): string =>
{
  const basePath = normalizeBasePath()
  return `${basePath}${BOARDS_ROUTE_PATH}`
}

export const getTemplateDetailPath = (slug: string): string =>
  `${getTemplatesPath()}/${slug}`
