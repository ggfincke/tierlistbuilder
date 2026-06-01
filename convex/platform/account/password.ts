// convex/platform/account/password.ts
// account password action & lookup

import {
  getAuthSessionId,
  modifyAccountCredentials,
  retrieveAccount,
} from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { action, internalQuery } from '../../_generated/server'
import { MIN_PASSWORD_LENGTH } from '@tierlistbuilder/contracts/platform/user'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { scheduleAuthSessionCleanup } from './cascadeDelete'

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const account = await ctx.runQuery(internal.users.getPasswordAccount, {
      userId,
    })
    if (!account)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'password account not found',
      })
    }
    if (args.newPassword.length < MIN_PASSWORD_LENGTH)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `new password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      })
    }
    if (args.currentPassword === args.newPassword)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'new password must be different from the current password',
      })
    }

    // password changes invalidate every other session
    // missing session id must abort before touching credentials
    const currentSessionId = await getAuthSessionId(ctx)
    if (!currentSessionId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'no active session for password change',
      })
    }

    try
    {
      const verified = await retrieveAccount(ctx, {
        provider: 'password',
        account: {
          id: account.providerAccountId,
          secret: args.currentPassword,
        },
      })
      if (verified.user._id !== userId || verified.account.userId !== userId)
      {
        throw new Error('InvalidAccountId')
      }
    }
    catch (error)
    {
      // retrieveAccount throws Error(reason) & shares sign-in rate limiting
      // surface expected failures distinctly; rethrow unknown errors
      const reason = error instanceof Error ? error.message : ''
      if (reason === 'TooManyFailedAttempts')
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.rateLimited,
          message: 'too many failed attempts; try again later',
        })
      }
      if (reason === 'InvalidSecret' || reason === 'InvalidAccountId')
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: 'current password is incorrect',
        })
      }
      throw error
    }

    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: { id: account.providerAccountId, secret: args.newPassword },
    })

    await scheduleAuthSessionCleanup(
      ctx,
      userId,
      { cursor: null, exceptSessionId: currentSessionId },
      'signOutOnly'
    )
    return null
  },
})

export const getPasswordAccount = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      providerAccountId: v.string(),
    })
  ),
  handler: async (ctx, args): Promise<{ providerAccountId: string } | null> =>
  {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', args.userId).eq('provider', 'password')
      )
      .unique()
    return account ? { providerAccountId: account.providerAccountId } : null
  },
})
