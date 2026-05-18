// src/shared/lib/dateFormatting.ts
// shared date display helpers for modal/list rows

// "Mon D" in the current calendar year, "Mon D, YYYY" otherwise
export const formatAbsoluteDate = (epochMs: number): string =>
{
  const target = new Date(epochMs)
  return target.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      target.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

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
