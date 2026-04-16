// src/features/workspace/tier-presets/model/tierPresetDiff.ts
// pure helpers for comparing two snapshots of useTierPresetStore.userPresets.
// used by the cloud-sync subscriber to derive per-preset operations:
//   - present in next but not prev      -> upsert (created)
//   - present in prev but not next      -> delete
//   - present in both, content differs  -> upsert (updated)
//
// content equality is structural: name + tiers (order-sensitive). built-in
// presets are excluded — they live client-side & never sync to the cloud

import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  TierPreset,
  TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { TierColorSpec } from '@tierlistbuilder/contracts/lib/theme'

const isUserPresetId = (id: string): id is UserPresetId =>
  id.startsWith('preset-')

const colorSpecsEqual = (
  a: TierColorSpec | undefined,
  b: TierColorSpec | undefined
): boolean =>
{
  if (a === undefined || b === undefined)
  {
    return a === b
  }
  if (a.kind !== b.kind)
  {
    return false
  }
  if (a.kind === 'palette' && b.kind === 'palette')
  {
    return a.index === b.index
  }
  if (a.kind === 'custom' && b.kind === 'custom')
  {
    return a.hex === b.hex
  }
  return false
}

const tierPresetTiersEqual = (
  a: readonly TierPresetTier[],
  b: readonly TierPresetTier[]
): boolean =>
{
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++)
  {
    const left = a[i]
    const right = b[i]
    if (left.name !== right.name) return false
    if (left.description !== right.description) return false
    if (!colorSpecsEqual(left.colorSpec, right.colorSpec)) return false
    if (!colorSpecsEqual(left.rowColorSpec, right.rowColorSpec)) return false
  }
  return true
}

export const tierPresetEqual = (a: TierPreset, b: TierPreset): boolean =>
{
  if (a.id !== b.id) return false
  if (a.name !== b.name) return false
  if (a.builtIn !== b.builtIn) return false
  return tierPresetTiersEqual(a.tiers, b.tiers)
}

const indexUserPresetsById = (
  presets: readonly TierPreset[]
): Map<UserPresetId, TierPreset> =>
{
  const map = new Map<UserPresetId, TierPreset>()
  for (const preset of presets)
  {
    if (!isUserPresetId(preset.id))
    {
      continue
    }
    map.set(preset.id, preset)
  }
  return map
}

export type PresetDiffOp =
  | { presetId: UserPresetId; kind: 'upsert'; preset: TierPreset }
  | { presetId: UserPresetId; kind: 'delete' }

export const diffUserPresets = (
  prev: readonly TierPreset[],
  next: readonly TierPreset[]
): PresetDiffOp[] =>
{
  const ops: PresetDiffOp[] = []
  const prevIndex = indexUserPresetsById(prev)
  const nextIndex = indexUserPresetsById(next)

  for (const [presetId, nextPreset] of nextIndex)
  {
    const prevPreset = prevIndex.get(presetId)
    if (!prevPreset || !tierPresetEqual(prevPreset, nextPreset))
    {
      ops.push({ presetId, kind: 'upsert', preset: nextPreset })
    }
  }

  for (const [presetId] of prevIndex)
  {
    if (!nextIndex.has(presetId))
    {
      ops.push({ presetId, kind: 'delete' })
    }
  }

  return ops
}
