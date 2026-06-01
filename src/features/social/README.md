# src/features/social

Public identity and account-facing product surfaces.

See `docs/architecture.md` for the slice boundary rules and the maintenance
rule for updating ownership docs.

## Current contents

- `profile/` - public profile route UI, authored-template list, and showcase view.
- `settings/` - signed-in account settings page and profile/account panels.
- `showcase/` - public profile showcase editor, save scheduler, and transforms.

## Boundary rules

- Social UI goes through social model hooks before reaching Convex.
- Social may compose platform auth, preferences, and media infrastructure.
- Platform infrastructure must not import social surfaces.
