// src/features/platform/auth/model/useAuthSession.ts
// * single source of session state — combines @convex-dev/auth's loading flag
// w/ getMe into a 'loading' | 'signed-out' | 'signed-in' discriminated shape

import { useConvexAuth, useQuery } from 'convex/react'
import { useMemo } from 'react'
import { api } from '@convex/_generated/api'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'

export type AuthSession =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: PublicUserMe }

const LOADING_SESSION: AuthSession = { status: 'loading' }
const SIGNED_OUT_SESSION: AuthSession = { status: 'signed-out' }

export const useAuthSession = (): AuthSession =>
{
  const { isLoading, isAuthenticated } = useConvexAuth()

  // skip the query while auth is loading or the caller is unauthenticated;
  // 'skip' tells convex/react not to subscribe at all so we don't burn a
  // websocket request for an answer we already know is null
  const me = useQuery(
    api.users.getMe,
    isLoading || !isAuthenticated ? 'skip' : {}
  )

  return useMemo<AuthSession>(() =>
  {
    if (isLoading) return LOADING_SESSION
    if (!isAuthenticated) return SIGNED_OUT_SESSION
    // authenticated but getMe hasn't resolved (undefined) — still loading.
    // authenticated but no users row exists (null) — treat as signed-out
    // until the afterUserCreatedOrUpdated callback fills it in
    if (me === undefined) return LOADING_SESSION
    if (me === null) return SIGNED_OUT_SESSION
    return { status: 'signed-in', user: me }
  }, [isLoading, isAuthenticated, me])
}
