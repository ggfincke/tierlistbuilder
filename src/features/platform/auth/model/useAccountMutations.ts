// src/features/platform/auth/model/useAccountMutations.ts
// typed Convex adapters for account-management UI actions

import { useCallback } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

export const useUpdateProfileMutation = () =>
  useMutation(api.users.updateProfile)

export const useAccountSessionsQuery = () =>
  useQuery(api.users.listSessions, {})

export const useSetAvatarAction = () =>
{
  const action = useAction(api.users.setAvatar)
  return useCallback(
    (args: { storageId: Id<'_storage'>; uploadToken: string }) => action(args),
    [action]
  )
}

export const useRemoveAvatarMutation = () =>
{
  const mutation = useMutation(api.users.removeAvatar)
  return useCallback((): Promise<null> => mutation({}), [mutation])
}

export const useChangePasswordAction = () =>
{
  const action = useAction(api.users.changePassword)
  return useCallback(
    (args: { currentPassword: string; newPassword: string }): Promise<null> =>
      action(args),
    [action]
  )
}

export const useRevokeSessionMutation = () =>
{
  const mutation = useMutation(api.users.revokeSession)
  return useCallback(
    (sessionId: Id<'authSessions'>): Promise<{ revokedCurrent: boolean }> =>
      mutation({ sessionId }),
    [mutation]
  )
}

export const useDeleteAccountMutation = () =>
{
  const mutation = useMutation(api.users.deleteAccount)
  return useCallback((): Promise<null> => mutation({}), [mutation])
}

export const useSignOutEverywhereMutation = () =>
{
  const mutation = useMutation(api.users.signOutEverywhere)
  return useCallback((): Promise<null> => mutation({}), [mutation])
}
