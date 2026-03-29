// src/types/index.ts
// core domain types for the tier list app

// single item placed in a tier or the unranked pool
export interface TierItem
{
  // unique identifier
  id: string
  // base64 data URL or image path (absent for text-only items)
  imageUrl?: string
  // optional display label (derived from filename on upload, required for text-only)
  label?: string
  // hex background color used when imageUrl is absent
  backgroundColor?: string
}

// stable palette slot used to derive a tier color from the active theme
export interface TierPaletteColorSpec
{
  kind: 'palette'
  // whether this color came from the default tier ladder or the picker presets
  paletteType: 'default' | 'preset'
  // zero-based index within the source palette group
  index: number
}

// literal custom color chosen by the user
export interface TierCustomColorSpec
{
  kind: 'custom'
  // resolved hex color that should remain stable across theme changes
  hex: string
}

// canonical color source for a tier label
export type TierColorSpec = TierPaletteColorSpec | TierCustomColorSpec

// a single tier row w/ ordered item references
export interface Tier
{
  // unique identifier
  id: string
  // display name shown in the label cell
  name: string
  // optional subtitle text displayed beneath the name
  description?: string
  // canonical color spec for the label background
  colorSpec: TierColorSpec
  // ordered list of item IDs assigned to this tier
  itemIds: string[]
}

// lightweight ordering snapshot used during drag preview
export interface ContainerSnapshotTier
{
  // stable tier ID used to map preview order back onto the full tier metadata
  id: string
  // ordered list of item IDs currently shown in this tier
  itemIds: string[]
}

// runtime-only container ordering snapshot used for drag preview
export interface ContainerSnapshot
{
  // item ordering for each tier row
  tiers: ContainerSnapshotTier[]
  // ordering for items outside all tiers
  unrankedItemIds: string[]
}

// full persisted state shape for the board
export interface TierListData
{
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
export interface NewTierItem
{
  // base64 data URL produced by the image resizer (absent for text-only items)
  imageUrl?: string
  // optional label derived from the source filename, required for text-only items
  label?: string
  // hex background color for text-only items
  backgroundColor?: string
}

// metadata entry for a single board in the multi-board registry
export interface BoardMeta
{
  // unique board identifier
  id: string
  // display title (kept in sync w/ TierListData.title)
  title: string
  // epoch millis when the board was created
  createdAt: number
}

// tier structure within a reusable preset (no IDs or items)
export interface TierPresetTier
{
  name: string
  colorSpec: TierColorSpec
  description?: string
}

// reusable board preset — defines tier structure w/o items
export interface TierPreset
{
  id: string
  name: string
  builtIn: boolean
  tiers: TierPresetTier[]
}

// supported image export formats
export type ImageFormat = 'png' | 'jpeg' | 'webp'

// item display size presets
export type ItemSize = 'small' | 'medium' | 'large'

// item crop shape presets
export type ItemShape = 'square' | 'rounded' | 'circle'

// tier label column width presets
export type LabelWidth = 'narrow' | 'default' | 'wide'

// color theme identifiers
export type ThemeId =
  | 'classic'
  | 'classic-light'
  | 'midnight'
  | 'forest'
  | 'ember'
  | 'sakura'
  | 'amoled'
  | 'high-contrast'

// text style identifiers
export type TextStyleId = 'default' | 'mono' | 'serif' | 'rounded' | 'display'

// tier label palette identifiers (classic-light reuses classic)
export type PaletteId =
  | 'classic'
  | 'midnight'
  | 'forest'
  | 'ember'
  | 'sakura'
  | 'amoled'
  | 'high-contrast'

// tier label font size presets (independent of item size)
export type TierLabelFontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl'

// runtime keyboard interaction states for item navigation & drag
export type KeyboardMode = 'idle' | 'browse' | 'dragging'

// global app settings — persisted independently of per-board data
export interface AppSettings
{
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  exportBackgroundOverride: string | null
  labelWidth: LabelWidth
  hideRowControls: boolean
  confirmBeforeDelete: boolean
  themeId: ThemeId
  textStyleId: TextStyleId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
  boardLocked: boolean
}

// appearance settings needed to render a board for export capture
export interface ExportAppearance
{
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  labelWidth: LabelWidth
  paletteId: PaletteId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
}
