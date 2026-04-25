// packages/contracts/lib/ids.ts
// branded ID types & factories shared across frontend modules

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
// (parsed JSON, persisted board payloads, share payloads)
export const asItemId = (value: string): ItemId => value as ItemId

// cast a plain string to BoardId at trust boundaries that already enforce
// the `board-` prefix contract
export const asBoardId = (value: string): BoardId => value as BoardId

// cast a plain string to TierId at trust boundaries that already enforce
// the `tier-` prefix contract
export const asTierId = (value: string): TierId => value as TierId

// cast a plain string to UserPresetId at trust boundaries that already enforce
// the `preset-` prefix contract
export const asUserPresetId = (value: string): UserPresetId =>
  value as UserPresetId

// cast a plain string to BuiltinPresetId at trust boundaries that already enforce
// the `builtin-` prefix contract
export const asBuiltinPresetId = (value: string): BuiltinPresetId =>
  value as BuiltinPresetId

// cast a plain string to PresetId when the caller accepts either persisted
// user presets or built-in preset IDs
export const asPresetId = (value: string): PresetId => value as PresetId

// narrow a string to the tier-ID brand. used when rehydrating from storage
// or accepting plain-string tier references
export const isTierId = (value: string): value is TierId =>
  value.startsWith('tier-')

// narrow an unknown (or string) to the user-preset ID brand. user presets
// always carry a 'preset-' prefix; built-ins use 'builtin-' & are client-only
export const isUserPresetId = (value: unknown): value is UserPresetId =>
  typeof value === 'string' && value.startsWith('preset-')

// fresh board ID — used as the in-memory board registry key
export const generateBoardId = (): BoardId =>
  `board-${crypto.randomUUID()}` as BoardId

// fresh tier ID — used for default & newly created tiers on boards & presets
export const generateTierId = (): TierId =>
  `tier-${crypto.randomUUID()}` as TierId

// fresh user-preset ID — built-ins use static 'builtin-*' slugs instead
export const generatePresetId = (): UserPresetId =>
  `preset-${crypto.randomUUID()}` as UserPresetId

// fresh item ID — plain UUID under the branded nominal type
export const generateItemId = (): ItemId => asItemId(crypto.randomUUID())
