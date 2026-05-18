// convex/marketplace/rankings/seed/naming.ts
// typed external-id format for seed-owned ranking & companion-board rows.

// on-disk shape: `<kind-prefix>:<tpl>:<crit>:<seed-kind>:<stable-key>` —
// callers route through these helpers so the format isn't redrawn as a raw string.

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export type SeedRankingKind = 'sample' | 'curated'

const RANKING_PREFIX = 'ranking:'
const BOARD_PREFIX = 'board:'
const SEED_EMAIL_DOMAIN = 'tierlistbuilder.local'
const SEED_AUTHOR_PREFIX = 'seed+rankings-'

export interface RankingSeedIdParts
{
  templateExternalId: string
  criterionExternalId: string
  kind: SeedRankingKind
  stableKey: string
}

const formatBody = (parts: RankingSeedIdParts): string =>
  `${parts.templateExternalId}:${parts.criterionExternalId}:${parts.kind}:${parts.stableKey}`

export const formatRankingSeedId = (parts: RankingSeedIdParts): string =>
  `${RANKING_PREFIX}${formatBody(parts)}`

export const formatBoardSeedId = (parts: RankingSeedIdParts): string =>
  `${BOARD_PREFIX}${formatBody(parts)}`

export const formatTierSeedId = (
  rankingSeedId: string,
  order: number
): string => `${rankingSeedId}:tier:${order.toString().padStart(2, '0')}`

export const companionBoardSeedId = (rankingSeedId: string): string =>
{
  if (!rankingSeedId.startsWith(RANKING_PREFIX))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `expected ranking seed externalId prefix '${RANKING_PREFIX}', got '${rankingSeedId}'`,
    })
  }
  return `${BOARD_PREFIX}${rankingSeedId.slice(RANKING_PREFIX.length)}`
}

export const canonicalAuthorKey = (raw: string): string =>
  raw.trim().toLowerCase()

export const sampleAuthorEmail = (profileKey: string): string =>
  `${SEED_AUTHOR_PREFIX}${canonicalAuthorKey(profileKey)}@${SEED_EMAIL_DOMAIN}`

export const curatedSeedAuthorKey = (rawAuthorKey: string): string =>
  `curated-${canonicalAuthorKey(rawAuthorKey)}`

export const curatedAuthorEmail = (rawAuthorKey: string): string =>
  sampleAuthorEmail(curatedSeedAuthorKey(rawAuthorKey))

export const isSeedRankingAuthorEmail = (email: string): boolean =>
  email.endsWith(`@${SEED_EMAIL_DOMAIN}`) &&
  email.startsWith(SEED_AUTHOR_PREFIX)
