// packages/contracts/lib/ids.ts
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

// item IDs are branded strings — runtime representation is a plain string but
// the type is nominal so the compiler rejects raw strings where ItemId is expected.
// use asItemId() at trust boundaries (JSON parse, storage load) to cast
declare const ITEM_ID_BRAND: unique symbol
export type ItemId = string & { readonly [ITEM_ID_BRAND]: void }

// cast an arbitrary string to ItemId at boundaries where the brand is lost
// (parsed JSON, share fragments, legacy storage values)
export const asItemId = (value: string): ItemId => value as ItemId
