// convex/auth.ts
// * convex auth entry — exports signIn, signOut, auth, & store helpers
// password provider is the only auth method today; google & apple OAuth
// providers land in a follow-up PR. the afterUserCreatedOrUpdated callback
// fires on createAccount (Password 'signUp' flow) & populates app-owned
// fields (externalId, displayName, tier) once per user

import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

import { upsertAppUserFields } from './lib/userUpsert'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password()],
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, { userId }) =>
    {
      await upsertAppUserFields(ctx, userId)
    },
  },
})
