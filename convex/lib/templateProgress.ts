// convex/lib/templateProgress.ts
// helpers for denormalized template-ranking progress on board rows

import type { Id } from '../_generated/dataModel'

export type TemplateProgressState = 'none' | 'in-progress' | 'complete'

export interface TemplateProgressCounts
{
  activeItemCount: number
  unrankedItemCount: number
}

export const resolveTemplateProgressState = (
  sourceTemplateId: Id<'templates'> | null,
  counts: TemplateProgressCounts
): TemplateProgressState =>
{
  if (!sourceTemplateId)
  {
    return 'none'
  }

  return counts.activeItemCount > 0 && counts.unrankedItemCount > 0
    ? 'in-progress'
    : 'complete'
}

export const countTemplateProgressItems = (
  items: readonly { externalId: string; tierId: string | null }[],
  deletedItemIds: ReadonlySet<string>
): TemplateProgressCounts =>
{
  let activeItemCount = 0
  let unrankedItemCount = 0

  for (const item of items)
  {
    if (deletedItemIds.has(item.externalId))
    {
      continue
    }

    activeItemCount++
    if (item.tierId === null)
    {
      unrankedItemCount++
    }
  }

  return { activeItemCount, unrankedItemCount }
}
