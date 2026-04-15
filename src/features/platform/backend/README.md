# src/features/platform/backend

Backend boundary for the frontend.

## Rules

- `convexClient.ts` is the single source of a `ConvexReactClient` instance
- UI components (`features/*/ui/*`) must **not** import `convexClient` directly
- Feature repositories (`features/*/data/cloud/*Repository.ts`) are the allowed callers — they wrap `client.query` / `client.mutation` and return typed domain objects
- When the auth UI PR lands, `ConvexAuthProvider` will wrap `<App />` in `src/app/main.tsx` and bind the client via `useConvexAuth()`

## Why this boundary

Matches the restructure proposal's `ui → model → data` rule. Components shouldn't know whether their data came from localStorage or Convex — the repository adapter decides. That way the cloud sync PR only has to change `data/local/` and `data/cloud/` siblings, not the entire UI tree.
