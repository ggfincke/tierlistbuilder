// src/features/platform/profile/model/usePublicProfile.ts
// public profile query state keyed by handle

import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { PublicUserProfile } from '@tierlistbuilder/contracts/platform/profile'

type PublicProfileResult =
  | { status: 'loading'; profile: null }
  | { status: 'not-found'; profile: null }
  | { status: 'ready'; profile: PublicUserProfile }

export const usePublicProfile = (handle: string): PublicProfileResult =>
{
  const profile = useQuery(
    api.platform.profile.queries.getPublicProfileByHandle,
    handle ? { handle } : 'skip'
  )

  if (!handle || profile === null)
  {
    return { status: 'not-found', profile: null }
  }

  if (profile === undefined)
  {
    return { status: 'loading', profile: null }
  }

  return { status: 'ready', profile }
}
