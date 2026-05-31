// src/shared/catalog/formatters.ts
// compact count formatter for catalog surfaces

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
