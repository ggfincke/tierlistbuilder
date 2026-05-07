// scripts/marketplace-seed/text.ts
// text helpers for marketplace seed metadata

export const titleizeFromFilename = (filename: string): string =>
{
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const noPrefix = stem.replace(/^\d+[a-z]?[-_.]?/, '')
  return noPrefix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
