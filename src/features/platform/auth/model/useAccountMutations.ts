// src/features/platform/auth/model/useAccountMutations.ts
// frontend-only account adapters for the extracted UI shell

import type {
  PublicUserSession,
  UserPrivacySettings,
} from '@tierlistbuilder/contracts/platform/user'

const serviceUnavailable = async (..._args: unknown[]): Promise<never> =>
{
  throw new Error('Account actions are not available in this UI-only build.')
}

export const useUpdateProfileMutation = () => serviceUnavailable

export const useUpdatePrivacySettingsMutation =
  () =>
  (_args: Partial<UserPrivacySettings>): Promise<never> =>
    serviceUnavailable(_args)

export const useAccountSessionsQuery = (): PublicUserSession[] => []

export const useSetAvatarAction =
  () =>
  (_args: { storageId: string; uploadToken: string }): Promise<never> =>
    serviceUnavailable(_args)

export const useRemoveAvatarMutation = () => serviceUnavailable

export const useChangePasswordAction =
  () =>
  (_args: { currentPassword: string; newPassword: string }): Promise<never> =>
    serviceUnavailable(_args)

export const useRevokeSessionMutation =
  () =>
  (_sessionId: string): Promise<{ revokedCurrent: boolean }> =>
    serviceUnavailable(_sessionId)

export const useDeleteAccountMutation = () => serviceUnavailable

export const useSignOutEverywhereMutation = () => serviceUnavailable
