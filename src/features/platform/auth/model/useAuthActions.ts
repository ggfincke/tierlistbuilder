// src/features/platform/auth/model/useAuthActions.ts
// frontend-only auth actions for the extracted UI shell

const serviceUnavailable = async (..._args: unknown[]): Promise<never> =>
{
  throw new Error('Auth actions are not available in this UI-only build.')
}

export const useAuthActions = () => ({
  signIn: serviceUnavailable,
  signOut: async (): Promise<void> =>
  {},
})
