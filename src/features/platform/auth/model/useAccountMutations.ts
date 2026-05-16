// src/features/platform/auth/model/useAccountMutations.ts
// typed Convex mutation adapters for account-management UI actions

import { useCallback } from 'react'
import { useMutation } from 'convex/react'

import { api } from '@convex/_generated/api'

export const useUpdateProfileMutation = () =>
  useMutation(api.users.updateProfile)

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
