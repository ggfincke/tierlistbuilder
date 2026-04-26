// src/features/marketplace/model/useSignInPromptStore.ts
// open/close state for the shared marketplace SignInModal so any CTA can
// prompt sign-in w/o prop drilling

import { create } from 'zustand'

interface SignInPromptStore
{
  open: boolean
  show: () => void
  hide: () => void
}

export const useSignInPromptStore = create<SignInPromptStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

// imperative entry for non-React callers (mutation-orchestration models)
export const promptSignIn = (): void =>
{
  useSignInPromptStore.getState().show()
}
