// src/features/platform/auth/model/useAuthSession.ts
// * single source of session state for the workspace UI
// combines @convex-dev/auth's loading flag w/ the getMe query into a
// discriminated 'loading' | 'signed-out' | 'signed-in' shape

import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'

export type AuthSession =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: Doc<'users'> }

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

  if (isLoading)
  {
    return { status: 'loading' }
  }

  if (!isAuthenticated)
  {
    return { status: 'signed-out' }
  }

  // authenticated but the getMe query hasn't returned yet — still loading
  if (me === undefined)
  {
    return { status: 'loading' }
  }

  // authenticated but no users row exists — should not happen once the auth
  // lib's afterUserCreatedOrUpdated callback runs, but we treat it the same
  // as signed-out so the UI stays sensible
  if (me === null)
  {
    return { status: 'signed-out' }
  }

  return { status: 'signed-in', user: me }
}
