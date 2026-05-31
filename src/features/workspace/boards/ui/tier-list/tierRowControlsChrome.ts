// src/features/workspace/boards/ui/tier-list/tierRowControlsChrome.ts
// shared control-cluster chrome for the live tier row & its drag-overlay mirror.
// both consume these so the drag preview can't visually drift from the live row

export const TIER_ROW_CONTROLS_CONTAINER =
  'flex shrink-0 items-center gap-1 border-l border-[var(--t-border)] bg-[var(--t-bg-page)] px-1.5 max-sm:px-1'

export const TIER_ROW_CONTROLS_COLUMN =
  'flex flex-col items-center justify-center gap-1'

export const TIER_ROW_COLOR_SWATCH =
  'h-4 w-4 rounded-full border border-[var(--t-border-secondary)]'
