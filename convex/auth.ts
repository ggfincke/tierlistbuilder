// convex/auth.ts
// * convex auth entry — exports signIn, signOut, auth, & store helpers
// afterUserCreatedOrUpdated populates app-owned fields; sync failure schedules a bounded retry

import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

import { scheduleUpsertRetry, upsertAppUserFields } from './lib/userUpsert'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password()],
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, { userId }) =>
    {
      try
      {
        await upsertAppUserFields(ctx, userId)
      }
      catch (error)
      {
        // don't rethrow — auth lib would roll back the transaction & block sign-in.
        // schedule a retry w/ exponential-ish backoff; user can use the app
        // immediately while queries that need externalId return undefined until retry lands
        console.warn(
          `upsertAppUserFields failed for ${userId}; scheduling retry:`,
          error
        )
        await scheduleUpsertRetry(ctx, userId)
      }
    },
  },
})
