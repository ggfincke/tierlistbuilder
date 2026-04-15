# src/features/platform/auth

Auth slice — wraps `@convex-dev/auth` for the workspace UI.

## Layout

- `model/useAuthSession.ts` — combines `useConvexAuth()` w/ `api.users.index.getMe` into a single discriminated session state. The only place UI components should reach for auth state.
- `model/useAuthActions.ts` — re-exports `signIn`/`signOut` from `@convex-dev/auth/react` so UI components can stay agnostic of the underlying provider package.
- `ui/AccountSection.tsx` — settings tab block. Sign-in trigger when signed out, profile card + sign-out when signed in.
- `ui/SignInModal.tsx` — modal w/ provider buttons. GitHub-only today; Google lands in a follow-up once the OAuth app is registered.

## Rules

- UI components must not import from `@convex-dev/auth/react` directly — they go through `model/useAuthSession` and `model/useAuthActions`.
- The slice does not own any other data — settings, boards, presets all stay on their own stores. The auth slice's only job is "who's signed in & how do I change that".
- `useAuthSession` returns `{ status: 'loading' | 'signed-out' | 'signed-in', user }`. The store/UI never sees raw Convex `null`/`undefined` semantics.
