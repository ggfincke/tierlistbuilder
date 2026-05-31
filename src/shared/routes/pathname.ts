// src/shared/routes/pathname.ts
// app route path helpers — base-path-aware URL builders for non-React callers
// (share-link composers etc); React components should use react-router hooks

export const EMBED_ROUTE_PATH = '/embed'
export const TEMPLATES_ROUTE_PATH = '/templates'
export const RANKINGS_ROUTE_PATH = '/rankings'
export const BOARDS_ROUTE_PATH = '/boards'
export const SETTINGS_ROUTE_PATH = '/settings'
export const PROFILE_ROUTE_PATH = '/u'
export const SHOWCASE_ROUTE_PATH = '/tier-list'

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

const withBasePath = (path: string): string => `${normalizeBasePath()}${path}`

const getTemplatesPath = (): string => withBasePath(TEMPLATES_ROUTE_PATH)

export const getTemplateDetailPath = (slug: string): string =>
  `${getTemplatesPath()}/${slug}`
