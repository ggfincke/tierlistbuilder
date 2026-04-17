// src/features/workspace/sharing/data/cloud/shortLinkRepository.ts
// Convex query/mutation adapters for the snapshot-share short link layer.
// imperative-only — both the embed-route bootstrap & the workspace inbound-
// share path run before React mounts, so no reactive hook variant is needed

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { ShortLinkResolveResult } from '@tierlistbuilder/contracts/platform/shortLink'
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

// link an uploaded snapshot blob to a fresh short slug. anon-callable; when
// signed in, the row's ownerId is set so the user can manage their links
export const createSnapshotShortLinkImperative = (args: {
  snapshotStorageId: Id<'_storage'>
}): Promise<{ slug: string; createdAt: number }> =>
  convexClient.mutation(
    api.platform.shortLinks.mutations.createSnapshotShortLink,
    args
  )
