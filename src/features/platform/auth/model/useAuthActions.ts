// src/features/platform/auth/model/useAuthActions.ts
// re-export of @convex-dev/auth signIn/signOut so UI components stay
// agnostic of the underlying provider package & we have a single seam to
// swap out if we ever change auth lib

export { useAuthActions } from '@convex-dev/auth/react'
