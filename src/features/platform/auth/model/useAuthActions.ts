// src/features/platform/auth/model/useAuthActions.ts
// re-exports @convex-dev/auth/react signIn & signOut as a single swap seam
// so the provider package stays isolated from every UI consumer

export { useAuthActions } from '@convex-dev/auth/react'
