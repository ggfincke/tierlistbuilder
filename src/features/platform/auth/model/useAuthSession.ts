// src/features/platform/auth/model/useAuthSession.ts
// signed-out session adapter for the extracted UI shell

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'

export type AuthSession =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: PublicUserMe }

const SIGNED_OUT_SESSION: AuthSession = { status: 'signed-out' }

export const useAuthSession = (): AuthSession => SIGNED_OUT_SESSION
