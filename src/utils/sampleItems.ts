// src/utils/sampleItems.ts
// sample item definitions & state builder for first-load / reset

import type { TierItem } from '../types'

// static list of bundled sample items w/ known IDs & image paths
const SAMPLE_ITEM_DEFINITIONS = [
  { id: 'sample-apex', label: 'Apex', imageUrl: '/sample-items/apex.jpg' },
  { id: 'sample-comet', label: 'Comet', imageUrl: '/sample-items/comet.jpg' },
  { id: 'sample-drift', label: 'Drift', imageUrl: '/sample-items/drift.jpg' },
  { id: 'sample-echo', label: 'Echo', imageUrl: '/sample-items/echo.jpg' },
  { id: 'sample-flux', label: 'Flux', imageUrl: '/sample-items/flux.jpg' },
  { id: 'sample-glint', label: 'Glint', imageUrl: '/sample-items/glint.jpg' },
  { id: 'sample-halo', label: 'Halo', imageUrl: '/sample-items/halo.jpg' },
  { id: 'sample-ion', label: 'Ion', imageUrl: '/sample-items/ion.jpg' },
  { id: 'sample-jolt', label: 'Jolt', imageUrl: '/sample-items/jolt.jpg' },
  { id: 'sample-nova', label: 'Nova', imageUrl: '/sample-items/nova.jpg' },
  { id: 'sample-prism', label: 'Prism', imageUrl: '/sample-items/prism.jpg' },
  {
    id: 'sample-signal',
    label: 'Signal',
    imageUrl: '/sample-items/signal.jpg',
  },
] as const satisfies ReadonlyArray<TierItem>

// build the items map & unranked ID list for the sample pack
export const buildSampleItemsState = () =>
{
  // index items by ID for O(1) lookup
  const items = Object.fromEntries(
    SAMPLE_ITEM_DEFINITIONS.map((item) => [item.id, { ...item }])
  ) as Record<string, TierItem>

  return {
    items,
    // place all sample items in the unranked pool initially
    unrankedItemIds: SAMPLE_ITEM_DEFINITIONS.map((item) => item.id),
  }
}
