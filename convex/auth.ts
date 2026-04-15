// convex/auth.ts
// * convex auth entry — exports signIn, signOut, auth, & store helpers
// OAuth provider IDs are registered here but no frontend is wired yet
// real OAuth apps (Google, GitHub, Discord) get configured in a follow-up PR

import GitHub from '@auth/core/providers/github'
import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, GitHub],
})
