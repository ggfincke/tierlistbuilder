# src/features/platform

Platform-level frontend capabilities shared across app surfaces.

See `docs/architecture.md` for the current boundary rules and the maintenance
rule for updating slice ownership docs.

## Current contents

- `auth/` - Convex Auth session bootstrap, account mutations, and sign-in UI.
- `media/` - upload URLs, image upload/finalize repositories, and fetch helpers.
- `preferences/` - app-wide presentation preferences and DOM theme runtime.
- `share/` - short-link repositories, URL builders, and inbound share resolver.
- `sync/` - foundational auth/connectivity/status primitives for cloud sync.

## Boundary rules

- UI components in `features/*/ui/*` should go through slice model/data APIs.
- Preferences own only global app presentation settings.
- Share resolution should return canonical board snapshots before UI code renders.
- Platform homes are infrastructure and must stay product-slice agnostic.
- Public identity, profile showcase, and account settings surfaces live in
  `features/social`.
