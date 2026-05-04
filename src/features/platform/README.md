# src/features/platform

Platform-level frontend capabilities shared across app surfaces.

Populated incrementally alongside the workspace slice. See `docs/architecture.md`
for the current boundary rules.

## Current contents

- `preferences/` - app-wide presentation preferences and DOM theme runtime.
- `share/` - inbound share-fragment resolution for workspace and embed routes.

## Boundary rules

- UI components in `features/*/ui/*` should go through slice model/data APIs.
- Preferences own only global app presentation settings.
- Share resolution should return canonical board snapshots before UI code renders.
