// src/shared/board-ui/initialsCode.ts
// short-code generators for cover/mosaic placeholders

const NON_WORD = /[^A-Za-z0-9]+/g
const VOWELS = /[aeiou]/gi

// stable 2-char fallback from an externalId — same item always yields the
// same code so a missing-label item doesn't visually re-shuffle on re-render
export const externalIdToCode = (externalId: string): string =>
{
  const cleaned = externalId.replace(NON_WORD, '')
  return cleaned.slice(0, 2).toUpperCase() || '··'
}

// derive a 2-3 char code from a label. words -> first letters (up to 3),
// single word -> consonants (drop vowels) up to 3 chars, else first 3
export const labelToCode = (label: string): string =>
{
  const cleaned = label.replace(NON_WORD, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/)
  if (words.length >= 2)
  {
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }
  const single = words[0]
  const compact = single.replace(VOWELS, '')
  const source = compact.length >= 2 ? compact : single
  return source.slice(0, 3).toUpperCase()
}
