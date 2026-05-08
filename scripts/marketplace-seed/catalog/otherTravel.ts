// scripts/marketplace-seed/catalog/otherTravel.ts
// travel metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const OTHER_TRAVEL_TEMPLATE_META = {
  'world-landmarks': {
    title: 'World landmarks',
    category: 'other',
    description:
      'Famous landmarks, monuments, ruins, bridges, towers, and architectural icons from around the world.',
    tags: ['landmarks', 'travel', 'places'],
    labels: true,
  },
  'us-national-parks': {
    title: 'US national parks',
    category: 'other',
    description:
      'Iconic US national parks across deserts, mountains, forests, wetlands, and volcanic landscapes.',
    tags: ['national parks', 'travel', 'nature'],
    labels: true,
    itemLabels: {
      '20-hawai-i-volcanoes.png': "Hawai'i Volcanoes",
    },
  },
  'theme-park-rides': {
    title: 'Theme park rides',
    category: 'other',
    description:
      'Well-known coasters, dark rides, thrill rides, and park staples from major theme parks.',
    tags: ['theme parks', 'rides', 'attractions'],
    labels: true,
    itemLabels: {
      '05-tiana-s-bayou-adventure.png': "Tiana's Bayou Adventure",
      '09-soarin.png': "Soarin'",
      '12-hagrid-s-motorbike-adventure.png': "Hagrid's Motorbike Adventure",
    },
  },
} satisfies Record<string, FolderMeta>
