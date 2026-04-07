// src/types/index.ts
// core domain types for the tier list app

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

// single item placed in a tier or the unranked pool
export interface TierItem
{
  // unique identifier
  id: ItemId
  // base64 data URL or image path (absent for text-only items)
  imageUrl?: string
  // optional display label (derived from filename on upload, required for text-only)
  label?: string
  // hex background color used when imageUrl is absent
  backgroundColor?: string
  // custom alt text for screen readers (falls back to label)
  altText?: string
  // true when the image was stripped for share link encoding
  imageStripped?: boolean
}

// stable palette slot used to derive a tier color from the active theme
export interface TierPaletteColorSpec
{
  kind: 'palette'
  // zero-based index within the active palette's ordered swatch list
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
  id: TierId
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
  id: TierId
  // ordered list of item IDs currently shown in this tier
  itemIds: ItemId[]
}

// runtime-only container ordering snapshot used for drag preview
export interface ContainerSnapshot
{
  // item ordering for each tier row
  tiers: ContainerSnapshotTier[]
  // ordering for items outside all tiers
  unrankedItemIds: ItemId[]
}

// full persisted state shape for the board
export interface TierListData
{
  // board title shown in the toolbar
  title: string
  // ordered list of tier rows
  tiers: Tier[]
  // item IDs in the unranked pool (not yet assigned to a tier)
  unrankedItemIds: ItemId[]
  // map of all items keyed by ID
  items: Record<ItemId, TierItem>
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
  id: BoardId
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
  id: PresetId
  name: string
  builtIn: boolean
  tiers: TierPresetTier[]
}

// supported image export formats
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'svg'

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

// tier label palette identifiers
export type PaletteId =
  | 'classic'
  | 'ocean'
  | 'midnight'
  | 'forest'
  | 'ember'
  | 'sakura'
  | 'twilight'
  | 'high-contrast'

// tier label font size presets (independent of item size)
export type TierLabelFontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl'

// toolbar placement relative to the tier list
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

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
  paletteId: PaletteId
  textStyleId: TextStyleId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
  boardLocked: boolean
  reducedMotion: boolean
  preHighContrastThemeId: ThemeId | null
  preHighContrastPaletteId: PaletteId | null
  toolbarPosition: ToolbarPosition
  showAltTextButton: boolean
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
