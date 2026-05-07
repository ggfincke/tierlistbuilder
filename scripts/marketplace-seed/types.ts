// scripts/marketplace-seed/types.ts
// shared types for marketplace seed scripts

import type {
  BoardLabelSettings,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import type { AutoCropBBox } from '@tierlistbuilder/contracts/workspace/imageMath'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'

export interface FolderMeta
{
  title?: string
  category: string
  description: string | null
  tags: string[]
  labels?: true | BoardLabelSettings
  itemLabels?: Record<string, string>
  suggestedTiers?: readonly TierPresetTier[]
}

export interface ProbedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  bbox: AutoCropBBox | null
}

export interface PreparedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  transform: ItemTransform | null
}

export interface PreparedFolder
{
  templateRatio: number
  ratioSource: 'consistent' | 'mixed-dominant' | 'mixed-square'
  items: PreparedItem[]
}

export interface SeedSummary
{
  succeeded: number
  failed: number
}

export interface SeedTarget
{
  folder: string
  category: string | null
}
