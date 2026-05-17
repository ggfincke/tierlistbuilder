// src/features/marketplace/components/consensus/criterion/criterionVisuals.ts
// client-side icon + accent palette for criteria. keyed by externalId so
// identity stays stable across renders w/o adding fields to the contract

import {
  Bookmark,
  Compass,
  Crown,
  Flame,
  Heart,
  Sparkles,
  Star,
  Trophy,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react'

interface CriterionVisual
{
  icon: LucideIcon
  accent: string
}

// curated map for the common semantic ids the seed catalog ships w/. anything
// else hashes into the fallback palette below so colors stay stable per id
const PRESETS: Record<string, CriterionVisual> = {
  competitive: { icon: Crown, accent: '#FFDF80' },
  comp: { icon: Crown, accent: '#FFDF80' },
  favorites: { icon: Sparkles, accent: '#FF7FFE' },
  favs: { icon: Sparkles, accent: '#FF7FFE' },
  fun: { icon: Flame, accent: '#FF7F7E' },
  annoying: { icon: Flame, accent: '#7EBFFF' },
  newcomer: { icon: User, accent: '#C1FF80' },
  dungeons: { icon: Compass, accent: '#7EBFFF' },
  story: { icon: Bookmark, accent: '#A1A1FF' },
  rewatch: { icon: Heart, accent: '#FF7F7E' },
  impact: { icon: Trophy, accent: '#FFDF80' },
}

const FALLBACKS: readonly CriterionVisual[] = [
  { icon: Trophy, accent: '#FFDF80' },
  { icon: Star, accent: '#FF7FFE' },
  { icon: Compass, accent: '#7EBFFF' },
  { icon: Heart, accent: '#FF7F7E' },
  { icon: Zap, accent: '#C1FF80' },
  { icon: Bookmark, accent: '#A1A1FF' },
] as const

const hashId = (id: string): number =>
{
  let h = 0
  for (let i = 0; i < id.length; i += 1)
  {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export const getCriterionVisual = (externalId: string): CriterionVisual =>
{
  const preset = PRESETS[externalId.toLowerCase()]
  if (preset) return preset
  const idx = hashId(externalId) % FALLBACKS.length
  return FALLBACKS[idx] ?? FALLBACKS[0]!
}
