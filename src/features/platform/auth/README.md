# src/features/platform/auth

Auth slice — wraps `@convex-dev/auth` for the workspace UI.

## Layout

- `model/useAuthSession.ts` — combines `useConvexAuth()` w/ `api.users.index.getMe` into a single discriminated session state. The only place UI components should reach for auth state.
- `model/useAuthActions.ts` — re-exports `signIn`/`signOut` from `@convex-dev/auth/react` so UI components can stay agnostic of the underlying provider package.
- `model/userIdentity.ts` — pure helper for deriving a stable per-user string ID (used as the IndexedDB upload-index partition key & as the cloud-merge "which user is this" cache key).
- `ui/AccountSection.tsx` — settings tab block. Sign-in trigger when signed out, profile card + sign-out when signed in.
- `ui/SignInModal.tsx` — modal w/ email/password inputs. OAuth providers land in a follow-up once the app is registered.

## Rules

- UI components must not import from `@convex-dev/auth/react` directly — they go through `model/useAuthSession` and `model/useAuthActions`.
- The slice does not own any other data — settings, boards, presets all stay on their own stores. The auth slice's only job is "who's signed in & how do I change that".
- `useAuthSession` returns `{ status: 'loading' | 'signed-out' | 'signed-in', user }`. The store/UI never sees raw Convex `null`/`undefined` semantics.

## Usage

```tsx
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'

const Profile = () => {
  const session = useAuthSession()
  const { signOut } = useAuthActions()
  if (session.status !== 'signed-in') return null
  return (
    <button onClick={() => signOut()}>Sign out {session.user.email}</button>
  )
}
```

## Sign-out data-retention policy

**Decision:** sign-out does _not_ purge local data. Local board registry, settings, tier presets, and the IndexedDB image blob store all stay in place.

Reasoning:

- Local-first is the primary mode. A user who signs out is still a valid user of the app — their boards should not vanish.
- The cloud-sync image upload index is keyed by `userId`, so bytes already uploaded by the previous session stay addressable if that user signs back in without the blob cache being nuked.
- Anyone who _wants_ an explicit wipe can clear the tab's storage via the browser (or in a future release, a dedicated "delete local copy of my data" action in the settings tab).

If we ever add a shared-device mode, the approach would be a deliberate `purgeLocalData()` helper wired to a user-facing "sign out and forget this device" action — _not_ a silent purge on every `signOut()`. That would surprise users who rely on sign-out to mean "pause cloud sync" rather than "wipe".

If that helper lands, it would need to:

1. Clear `useWorkspaceBoardRegistryStore` + every per-board localStorage key (`boardStorage.ts`).
2. Clear `useSettingsStore` + `useTierPresetStore`.
3. Clear the IndexedDB `UPLOAD_INDEX_STORE` entries for that `userId` + open a transaction to clear the `BLOBS_STORE` object store.
4. Clear `cloudMerge` markers so the next sign-in re-runs the merge flow.
