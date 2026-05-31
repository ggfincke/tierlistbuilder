// convex/lib/avatar.ts
// shared user-avatar URL resolution

import type { Id } from '../_generated/dataModel'

type AvatarStorageCtx = {
  storage: { getUrl(storageId: Id<'_storage'>): Promise<string | null> }
}

export const resolveUserAvatarUrl = async (
  ctx: AvatarStorageCtx,
  user: { avatarStorageId?: Id<'_storage'>; image?: string | null }
): Promise<string | null> =>
  user.avatarStorageId
    ? await ctx.storage.getUrl(user.avatarStorageId)
    : (user.image ?? null)
