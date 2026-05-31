// src/features/platform/auth/model/useSyncOwnerUserId.ts
// signed-in stable user id for local changes queued to cloud sync

import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'

export const useSyncOwnerUserId = (): string | null =>
{
  const session = useAuthSession()
  return session.status === 'signed-in' ? getUserStableId(session.user) : null
}
