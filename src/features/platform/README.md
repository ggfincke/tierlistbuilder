# src/features/platform

Platform-level frontend capabilities shared across app surfaces.

See `docs/architecture.md` for the current boundary rules and the maintenance
rule for updating slice ownership docs.

## Current contents

- `auth/` - Convex Auth session bootstrap, account mutations, and sign-in UI.
- `media/` - upload URLs, image upload/finalize repositories, and fetch helpers.
- `preferences/` - app-wide presentation preferences and DOM theme runtime.
- `profile/` - public profile route UI and authored-template/profile chrome.
- `settings/` - signed-in account settings page and account-management panels.
- `share/` - short-link repositories, URL builders, and inbound share resolver.
- `showcase/` - public profile showcase editor and profile-showcase transforms.
- `sync/` - foundational auth/connectivity/status primitives for cloud sync.

## Boundary rules

- UI components in `features/*/ui/*` should go through slice model/data APIs.
- Preferences own only global app presentation settings.
- Share resolution should return canonical board snapshots before UI code renders.
- Infrastructure homes (`auth`, `media`, `preferences`, `share`, `sync`) should
  stay product-slice agnostic.
- Product surfaces currently here (`profile`, `settings`, `showcase`) are
  transitional and should not be treated as precedent for new infrastructure.
