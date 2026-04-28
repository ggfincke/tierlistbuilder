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
