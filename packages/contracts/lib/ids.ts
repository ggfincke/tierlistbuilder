// packages/contracts/lib/ids.ts
// branded ID types & factories shared across the frontend & convex backend

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
// or accepting legacy tier references that carry the plain string shape
export const isTierId = (value: string): value is TierId =>
  value.startsWith('tier-')

// narrow an unknown (or string) to the user-preset ID brand. user presets
// always carry a 'preset-' prefix; built-ins use 'builtin-' & are client-only
export const isUserPresetId = (value: unknown): value is UserPresetId =>
  typeof value === 'string' && value.startsWith('preset-')

// fresh board ID — used both as the in-memory board registry key & as the
// external identifier persisted to convex for sync
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

// fresh media externalId — prefixed for stable public lookup & signed URLs
export const generateMediaAssetExternalId = (): string =>
  `media-${crypto.randomUUID()}`

// fresh user externalId — prefixed for clarity across logs & admin UI
export const generateUserExternalId = (): string =>
  `user-${crypto.randomUUID()}`

// base62 alphabet for short link slug generation
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const SHORT_LINK_SLUG_LENGTH = 8
const SHORT_LINK_SLUG_PATTERN = new RegExp(
  `^[0-9A-Za-z]{${SHORT_LINK_SLUG_LENGTH}}$`
)

// narrow an unknown to the canonical short-link slug shape
export const isShortLinkSlug = (value: unknown): value is string =>
  typeof value === 'string' && SHORT_LINK_SLUG_PATTERN.test(value)

// fresh short link slug — 8 chars of base62 (~218 trillion combinations).
// the short-links mutation must check for collisions before inserting
export const generateShortLinkSlug = (): string =>
{
  const bytes = new Uint8Array(SHORT_LINK_SLUG_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes)
  {
    out += BASE62[byte % 62]
  }
  return out
}
