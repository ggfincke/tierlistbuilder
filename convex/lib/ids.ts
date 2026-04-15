// convex/lib/ids.ts
// externalId generators for app-owned entities — produces the branded prefix
// pattern used across share links, JSON exports, & frontend state

// fresh board externalId — matches BoardId template literal brand
export const newBoardExternalId = (): string => `board-${crypto.randomUUID()}`

// fresh tier externalId — matches TierId template literal brand
export const newTierExternalId = (): string => `tier-${crypto.randomUUID()}`

// fresh item externalId — plain UUID, brand is added at the TypeScript boundary
export const newItemExternalId = (): string => crypto.randomUUID()

// fresh media externalId — prefixed for stable public lookup & signed URLs
export const newMediaAssetExternalId = (): string =>
  `media-${crypto.randomUUID()}`

// fresh preset externalId — matches UserPresetId template literal brand
export const newPresetExternalId = (): string => `preset-${crypto.randomUUID()}`

// fresh user externalId — prefixed for clarity across logs & admin UI
export const newUserExternalId = (): string => `user-${crypto.randomUUID()}`

// base62 alphabet for short link slug generation
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

// fresh short link slug — 8 chars of base62 (~218 trillion combinations)
// the short-links mutation must check for collisions before inserting
export const newShortLinkSlug = (): string =>
{
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes)
  {
    out += BASE62[byte % 62]
  }
  return out
}
