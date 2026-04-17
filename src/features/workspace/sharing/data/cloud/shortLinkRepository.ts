// src/features/workspace/sharing/data/cloud/shortLinkRepository.ts
// Convex adapters for the snapshot-share short link layer.
// resolve/generate/create are imperative (pre-React); list is reactive; revoke is imperative

import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type {
  OwnedShortLinkListItem,
  ShortLinkResolveResult,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { convexClient } from '~/features/platform/backend/convexClient'

// imperative resolve for the embed-route bootstrap & workspace inbound-share
// path; both run before any React tree mounts so a hook isn't an option
export const resolveShortLinkImperative = (args: {
  slug: string
}): Promise<ShortLinkResolveResult> =>
  convexClient.query(api.platform.shortLinks.queries.resolveSlug, args)

// generate a one-time _storage upload URL for the snapshot blob. anon-callable
export const generateSnapshotUploadUrlImperative = (): Promise<string> =>
  convexClient.mutation(
    api.platform.shortLinks.mutations.generateSnapshotUploadUrl,
    {}
  )

// link an uploaded snapshot blob to a fresh slug. anon-callable; when signed in,
// ownerId is set so the user can manage their links. boardTitle is denormalized for the listing UI
export const createSnapshotShortLinkImperative = (args: {
  snapshotStorageId: Id<'_storage'>
  boardTitle: string
}): Promise<{ slug: string; createdAt: number }> =>
  convexClient.mutation(
    api.platform.shortLinks.mutations.createSnapshotShortLink,
    args
  )

// reactive listing for the "Recent shares" modal. anon callers see []. the
// query also filters out expired-but-not-yet-reaped rows so the listing
// matches the resolve query's expiry semantics
export const useListMyShortLinks = (
  enabled: boolean
): OwnedShortLinkListItem[] | undefined =>
  useQuery(
    api.platform.shortLinks.queries.getMyShortLinks,
    enabled ? {} : 'skip'
  )

// imperative variant kept for parity w/ the deleted-boards repository
// pattern. no current caller, but the symmetry pays off the next time a
// non-React surface needs the listing
export const listMyShortLinksImperative = (): Promise<
  OwnedShortLinkListItem[]
> => convexClient.query(api.platform.shortLinks.queries.getMyShortLinks, {})

// revoke an owned short link by slug. silent no-op on missing slugs (reaped by TTL or
// revoked elsewhere) — UI optimistically removes the row w/o special-casing
export const revokeShortLinkImperative = (args: {
  slug: string
}): Promise<null> =>
  convexClient.mutation(
    api.platform.shortLinks.mutations.revokeMyShortLink,
    args
  )
