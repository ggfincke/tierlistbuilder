# src/features/platform/backend

Backend boundary for the frontend.

## Rules

- `convexClient.ts` is the single source of a `ConvexReactClient` instance.
- UI components (`features/*/ui/*`) must **not** import `convexClient` directly.
- Feature repositories (`features/*/data/cloud/*Repository.ts`) are the allowed callers — they wrap `client.query` / `client.mutation` and return typed domain objects.
- `ConvexAuthProvider` wraps `<App />` in `src/app/main.tsx` and binds the client via `useConvexAuth()`. Downstream hooks read auth via `features/platform/auth/model/useAuthSession`.

## Why this boundary

Matches the restructure proposal's `ui → model → data` rule. Components shouldn't know whether their data came from localStorage or Convex — the repository adapter decides. When a feature needs a new cloud call, it adds a hook/imperative pair in its own `data/cloud/*Repository.ts` and every UI change stops there.

## Usage examples

React hook-based queries (preferred inside components):

```tsx
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

const useMyBoards = (enabled: boolean) =>
  useQuery(api.workspace.boards.queries.getMyBoards, enabled ? {} : 'skip')
```

Imperative mutations (for background sync, schedulers, effects that live outside React):

```ts
import { convexClient } from '~/features/platform/backend/convexClient'
import { api } from '@convex/_generated/api'

export const deleteBoardImperative = (args: { boardExternalId: string }) =>
  convexClient.mutation(api.workspace.boards.mutations.deleteBoard, args)
```

Both examples live in the consuming feature's `data/cloud/boardRepository.ts`, not in UI files.

## Env vars

- `VITE_CONVEX_URL` — required. The client constructor throws at module load if unset so deploy misconfigurations fail fast instead of producing a dead auth surface at runtime.
