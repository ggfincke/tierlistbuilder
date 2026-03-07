// src/types/index.ts
// core domain types for the tier list app

// single item placed in a tier or the unranked pool
export interface TierItem {
  // unique identifier
  id: string
  // base64 data URL or image path
  imageUrl: string
  // optional display label (derived from filename on upload)
  label?: string
}

// a single tier row w/ ordered item references
export interface Tier {
  // unique identifier
  id: string
  // display name shown in the label cell
  name: string
  // hex color for the label background
  color: string
  // ordered list of item IDs assigned to this tier
  itemIds: string[]
}

// lightweight ordering snapshot used during drag preview
export interface ContainerSnapshotTier {
  // stable tier ID used to map preview order back onto the full tier metadata
  id: string
  // ordered list of item IDs currently shown in this tier
  itemIds: string[]
}

// runtime-only container ordering snapshot used for drag preview
export interface ContainerSnapshot {
  // item ordering for each tier row
  tiers: ContainerSnapshotTier[]
  // ordering for items outside all tiers
  unrankedItemIds: string[]
}

// full persisted state shape for the board
export interface TierListData {
  // board title shown in the toolbar
  title: string
  // ordered list of tier rows
  tiers: Tier[]
  // item IDs in the unranked pool (not yet assigned to a tier)
  unrankedItemIds: string[]
  // map of all items keyed by ID
  items: Record<string, TierItem>
}

// payload for adding new items (before IDs are assigned)
export interface NewTierItem {
  // base64 data URL produced by the image resizer
  imageUrl: string
  // optional label derived from the source filename
  label?: string
}
