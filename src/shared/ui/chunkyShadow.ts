// src/shared/ui/chunkyShadow.ts
// Scoreboard signature — 2px accent-2 shadow growing to 3px on hover w/ -1/-1
// translate. Pair w/ CHUNKY_SHADOW_TRANSITION on hosts w/o `transition`

export const CHUNKY_SHADOW_ACCENT =
  'shadow-[2px_2px_0_var(--t-accent-2)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--t-accent-2)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--t-accent-2)]'

// group-hover variant for nested CTAs that should respond to a parent's hover
// (e.g. Hero CTA where the whole hero block is the hover target)
export const CHUNKY_SHADOW_ACCENT_GROUP =
  'shadow-[2px_2px_0_var(--t-accent-2)] group-hover:-translate-x-px group-hover:-translate-y-px group-hover:shadow-[3px_3px_0_var(--t-accent-2)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--t-accent-2)]'

// destructive primary keeps the same rhythm but casts the shadow in its own
// destructive-hover color so it never reads as accent-2
export const CHUNKY_SHADOW_DESTRUCTIVE =
  'shadow-[2px_2px_0_var(--t-destructive-hover)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--t-destructive-hover)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--t-destructive-hover)]'

// static 2px accent shadow w/o interaction states — for non-interactive pills
// that share the editorial register but don't respond to pointer
export const CHUNKY_SHADOW_ACCENT_STATIC =
  'shadow-[2px_2px_0_var(--t-accent-2)]'

// transition declaration to pair w/ the interactive shadow variants above
// when the host element doesn't already include `transition`
export const CHUNKY_SHADOW_TRANSITION =
  'transition-[transform,box-shadow] duration-100'
