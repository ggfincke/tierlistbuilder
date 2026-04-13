// src/shared/types/ids.ts
// branded ID types used across board, tier, preset, & item references

// generated board ID stored in the board registry & per-board storage keys
export type BoardId = `board-${string}`

// generated tier ID used for default & newly created tiers
export type TierId = `tier-${string}`

// app-generated preset IDs for user presets
export type UserPresetId = `preset-${string}`

// static preset IDs for built-in presets shipped w/ the app
export type BuiltinPresetId = `builtin-${string}`

// valid preset ID for either a built-in or user-saved preset
export type PresetId = UserPresetId | BuiltinPresetId

// item IDs remain plain strings because persisted/imported boards may carry
// existing bare UUID values
export type ItemId = string
