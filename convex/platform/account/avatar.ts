// convex/platform/account/avatar.ts
// account avatar mutations

import { ConvexError, v } from 'convex/values'
import { action, internalMutation, mutation } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { deleteStorageSilently } from '../../lib/storage'
import { loadVerifiedEnvelopeImage } from '../../lib/uploadedImage'
import { scheduleAuthorCardSync } from './cardSync'

export const removeAvatar = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const user = await ctx.db.get(userId)
    if (!user || !user.avatarStorageId)
    {
      return null
    }
    await ctx.db.patch(userId, {
      avatarStorageId: undefined,
      updatedAt: Date.now(),
    })
    await scheduleAuthorCardSync(ctx, userId)
    return null
  },
})

export const setAvatar = action({
  args: {
    storageId: v.id('_storage'),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const { storageId: cleanStorageId } = await loadVerifiedEnvelopeImage(ctx, {
      storageId: args.storageId,
      userId,
      uploadToken: args.uploadToken,
      label: 'avatar',
    })
    try
    {
      await ctx.runMutation(internal.users.commitAvatar, {
        userId,
        avatarStorageId: cleanStorageId,
      })
    }
    catch (error)
    {
      // commit is the only fallible step; on failure delete the orphaned clean
      // blob so a rejected upload never leaves a dangling, unreferenced blob
      await deleteStorageSilently(ctx, cleanStorageId)
      throw error
    }
    // client picks up the new avatar via the reactive getMe subscription
    return null
  },
})

export const commitAvatar = internalMutation({
  args: {
    userId: v.id('users'),
    avatarStorageId: v.id('_storage'),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const user = await ctx.db.get(args.userId)
    if (!user)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'user not found',
      })
    }
    await ctx.db.patch(args.userId, {
      avatarStorageId: args.avatarStorageId,
      updatedAt: Date.now(),
    })
    await scheduleAuthorCardSync(ctx, args.userId)
    return null
  },
})
