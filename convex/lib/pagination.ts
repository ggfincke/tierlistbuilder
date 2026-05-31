// convex/lib/pagination.ts
// small pagination helpers shared by Convex read modules

import { clamp } from '@tierlistbuilder/contracts/lib/math'

export const emptyPaginatedResult = <T>(
  cursor: string | null
): { page: T[]; isDone: true; continueCursor: string } => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

export const clampPageSize = (
  raw: number,
  defaultSize: number,
  maxSize: number
): number =>
{
  if (!Number.isFinite(raw)) return defaultSize
  return clamp(Math.floor(raw), 1, maxSize)
}
