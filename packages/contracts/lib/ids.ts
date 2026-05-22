// packages/contracts/lib/ids.ts
// branded ID types & factories shared across the frontend & convex backend

// generated board ID stored in the board registry & per-board storage keys
export type BoardId = `board-${string}`

// generated tier ID used for default & newly created tiers
export type TierId = `tier-${string}`

// app-generated preset IDs for user presets
export type UserPresetId = `preset-${string}`

// static preset IDs for built-in presets shipped w/ the app
type BuiltinPresetId = `builtin-${string}`

// valid preset ID for either a built-in or user-saved preset
export type PresetId = UserPresetId | BuiltinPresetId

type MediaAssetExternalId = `media-${string}`

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

// narrow an unknown value to the board-ID brand.
export const isBoardId = (value: unknown): value is BoardId =>
  typeof value === 'string' && value.startsWith('board-')

// narrow a string to the tier-ID brand. used when rehydrating from storage
// or accepting plain-string tier references
export const isTierId = (value: string): value is TierId =>
  value.startsWith('tier-')

// narrow an unknown value to the media external-ID brand.
export const isMediaAssetExternalId = (
  value: unknown
): value is MediaAssetExternalId =>
  typeof value === 'string' && value.startsWith('media-')

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
export const generateMediaAssetExternalId = (): MediaAssetExternalId =>
  `media-${crypto.randomUUID()}`

// fresh user externalId — prefixed for clarity across logs & admin UI
export const generateUserExternalId = (): string =>
  `user-${crypto.randomUUID()}`

// base62 alphabet for public slug generation
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const BASE62_REJECTION_LIMIT = Math.floor(256 / BASE62.length) * BASE62.length
const SHORT_LINK_SLUG_LENGTH = 8

export const isBase62Slug = (value: unknown, length: number): value is string =>
  typeof value === 'string' &&
  value.length === length &&
  [...value].every((char) => BASE62.includes(char))

export const generateBase62Slug = (length: number): string =>
{
  let out = ''
  const buf = new Uint8Array(length)
  while (out.length < length)
  {
    crypto.getRandomValues(buf)
    for (const byte of buf)
    {
      if (byte >= BASE62_REJECTION_LIMIT) continue
      out += BASE62[byte % BASE62.length]
      if (out.length === length) break
    }
  }
  return out
}

// narrow an unknown to the canonical short-link slug shape
export const isShortLinkSlug = (value: unknown): value is string =>
  isBase62Slug(value, SHORT_LINK_SLUG_LENGTH)

// fresh short-link slug — 8 chars of base62 (~218T combos); mutation checks
// collisions before inserting. rejection-sample bytes >= 248 so `byte % 62`
// stays uniform (248..255 would skew toward 0..7)
export const generateShortLinkSlug = (): string =>
  generateBase62Slug(SHORT_LINK_SLUG_LENGTH)
