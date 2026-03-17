// src/types/index.ts
// core domain types for the tier list app

// single item placed in a tier or the unranked pool
export interface TierItem {
  // unique identifier
  id: string
  // base64 data URL or image path (absent for text-only items)
  imageUrl?: string
  // optional display label (derived from filename on upload, required for text-only)
  label?: string
  // hex background color used when imageUrl is absent
  backgroundColor?: string
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
  // recently deleted items available for restore (newest first, capped at 50)
  deletedItems: TierItem[]
}

// payload for adding new items (before IDs are assigned)
export interface NewTierItem {
  // base64 data URL produced by the image resizer (absent for text-only items)
  imageUrl?: string
  // optional label derived from the source filename, required for text-only items
  label?: string
  // hex background color for text-only items
  backgroundColor?: string
}

// metadata entry for a single board in the multi-board registry
export interface BoardMeta {
  // unique board identifier
  id: string
  // display title (kept in sync w/ TierListData.title)
  title: string
  // epoch millis when the board was created
  createdAt: number
}

// supported image export formats
export type ImageFormat = 'png' | 'jpeg' | 'webp'

// item display size presets
export type ItemSize = 'small' | 'medium' | 'large'

// item crop shape presets
export type ItemShape = 'square' | 'rounded' | 'circle'

// tier label column width presets
export type LabelWidth = 'narrow' | 'default' | 'wide'

// global app settings — persisted independently of per-board data
export interface AppSettings {
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  exportBackgroundColor: string
  labelWidth: LabelWidth
  hideRowControls: boolean
  confirmBeforeDelete: boolean
}
