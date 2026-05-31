// src/shared/board-data/tierNaming.ts
// continues a tier label series (letters, numbers, ordinals) like excel autofill

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'

const LETTER = /^[A-Za-z]$/
const ORDINAL = /^(.*?)(\d+)(st|nd|rd|th)$/i
const TRAILING_NUMBER = /^(.*?)(\d+)$/

// english ordinal suffix for n (1->st, 2->nd, 3->rd, 11-13->th)
const ordinalSuffix = (n: number): string =>
{
  const teens = n % 100
  if (teens >= 11 && teens <= 13) return 'th'
  switch (n % 10)
  {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

// next value in a detected series, or null when nothing increments
const nextInSequence = (raw: string): string | null =>
{
  const name = raw.trim()
  if (!name) return null

  if (LETTER.test(name))
  {
    if (name === 'Z' || name === 'z') return null
    return String.fromCharCode(name.charCodeAt(0) + 1)
  }

  const ordinal = name.match(ORDINAL)
  if (ordinal)
  {
    const next = Number(ordinal[2]) + 1
    return `${ordinal[1]}${next}${ordinalSuffix(next)}`
  }

  const trailing = name.match(TRAILING_NUMBER)
  if (trailing)
  {
    const digits = trailing[2]
    const next = String(Number(digits) + 1).padStart(digits.length, '0')
    return `${trailing[1]}${next}`
  }

  return null
}

// name for a newly added tier; continues the row above the insert point
// (or the last row when appending), else falls back to a free "Tier N"
export const getNextTierName = (
  tiers: Tier[],
  insertIndex?: number
): string =>
{
  const reference =
    insertIndex === undefined ? tiers[tiers.length - 1] : tiers[insertIndex - 1]
  const existing = new Set(tiers.map((tier) => tier.name))

  if (reference)
  {
    const candidate = nextInSequence(reference.name)
    if (candidate !== null && !existing.has(candidate)) return candidate
  }

  let n = tiers.length + 1
  while (existing.has(`Tier ${n}`)) n++
  return `Tier ${n}`
}
