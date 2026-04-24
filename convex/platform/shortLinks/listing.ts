// convex/platform/shortLinks/listing.ts
// pure short-link listing selection shared by query code & tests

import {
  MAX_OWNED_SHORT_LINKS,
  type OwnedShortLinkListItem,
} from '@tierlistbuilder/contracts/platform/shortLink'
import type { Doc } from '../../_generated/dataModel'

export type OwnedShortLinkRow = Pick<
  Doc<'shortLinks'>,
  'slug' | 'boardTitle' | 'createdAt' | 'expiresAt'
>

export const selectLiveOwnedShortLinks = (
  rows: readonly OwnedShortLinkRow[],
  now: number,
  limit = MAX_OWNED_SHORT_LINKS
): OwnedShortLinkListItem[] =>
{
  return rows
    .filter((row) => row.expiresAt > now)
    .slice(0, limit)
    .map((row) => ({
      slug: row.slug,
      boardTitle: row.boardTitle,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }))
}
