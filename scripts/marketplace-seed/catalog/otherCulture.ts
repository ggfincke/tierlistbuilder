// scripts/marketplace-seed/catalog/otherCulture.ts
// culture metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const OTHER_CULTURE_TEMPLATE_META = {
  'card-games': {
    title: 'Card games',
    category: 'other',
    description:
      'Classic card games, casino staples, family games, and modern tabletop card favorites.',
    tags: ['cards', 'tabletop', 'games'],
    labels: true,
    itemLabels: {
      '16-magic-the-gathering.png': 'Magic: The Gathering',
      '17-pokemon-tcg.png': 'Pokemon TCG',
      '18-yu-gi-oh.png': 'Yu-Gi-Oh!',
    },
  },
  'art-movements': {
    title: 'Art movements',
    category: 'other',
    description:
      'Major art movements from Renaissance painting through modern and contemporary styles.',
    tags: ['art', 'history', 'culture'],
    labels: true,
  },
  'board-games': {
    title: 'Board games',
    category: 'other',
    description:
      'Classic and modern tabletop favorites from Chess and Monopoly to Gloomhaven and Wingspan.',
    tags: ['board games', 'tabletop', 'games'],
  },
  'lego-themes': {
    title: 'LEGO themes',
    category: 'other',
    description:
      'Classic, licensed, and modern LEGO theme lines from City and Space to Star Wars and Super Mario.',
    tags: ['lego', 'toys', 'themes'],
  },
  'dog-breeds': {
    title: 'Dog breeds',
    category: 'other',
    description:
      "Popular & iconic dog breeds — sporting, working, herding, hounds, terriers, & toy companions you'll actually recognize.",
    tags: ['dogs', 'breeds', 'animals', 'pets'],
    labels: true,
  },
  'car-brands': {
    title: 'Car brands',
    category: 'other',
    description:
      'Car manufacturers — American muscle, German engineering, Italian exotics, Japanese reliability, & British luxury — by official badge or wordmark.',
    tags: ['cars', 'automotive', 'brands', 'logos'],
    labels: true,
    itemLabels: {
      '007-gmc.jpg': 'GMC',
      '009-bmw.png': 'BMW',
      '010-mercedes-benz.png': 'Mercedes-Benz',
      '019-rolls-royce.png': 'Rolls-Royce',
    },
  },
} satisfies Record<string, FolderMeta>
