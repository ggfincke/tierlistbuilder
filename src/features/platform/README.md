# src/features/platform

Platform capabilities — auth, cloud sync, media, short links, notifications, moderation.

Populated incrementally alongside the workspace slice. See `dev-docs/directory-restructure-proposal.mdx` for the long-form plan & boundary rules.

## Current contents

- `auth/` — `@convex-dev/auth` wrapper. `useAuthSession`, `useAuthActions`, sign-in modal, account settings section.
- `backend/` — shared `ConvexReactClient` singleton & the single entry point for raw Convex API calls.
- `sync/` — cloud sync scheduler + first-login merge flow. Drives the push side of board persistence when the user is signed in.

## Boundary rules

- UI components in `features/*/ui/*` must not import the Convex client directly — they go through `features/*/data/cloud/*Repository.ts` adapters that wrap query/mutation calls and return typed domain objects.
- The auth slice owns auth state only. Settings, boards, presets each live in their own stores. Sign-out does not purge local data (see `auth/README.md` for the full policy).
- `sync/` consumes the auth session (via the `user` prop into `useCloudSync`) but does not own it. Sign-in/out flow through auth → sync, never the reverse.
