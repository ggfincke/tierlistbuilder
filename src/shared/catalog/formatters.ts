// src/shared/catalog/formatters.ts
// compact count, relative-time, & estimate formatters for catalog surfaces

export const formatCount = (n: number): string =>
{
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000)
  {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (n >= 1_000)
  {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(n))
}

export const pluralize = (
  n: number,
  singular: string,
  plural?: string
): string => (n === 1 ? singular : (plural ?? `${singular}s`))

export const formatRelativeTime = (
  iso: number | string,
  now = Date.now()
): string =>
{
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const diffMs = Math.max(0, now - ms)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays < 1) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

export const formatTimeToRank = (itemCount: number): string =>
{
  const seconds = Math.max(0, itemCount) * 3
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}
