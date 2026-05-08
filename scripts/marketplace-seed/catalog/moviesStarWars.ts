// scripts/marketplace-seed/catalog/moviesStarWars.ts
// Star Wars metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const MOVIES_STAR_WARS_TEMPLATE_META = {
  'star-wars-films': {
    title: 'Star Wars theatrical films',
    category: 'movies',
    description: 'Every theatrical Star Wars release, by poster.',
    tags: ['star wars', 'films', 'lucasfilm'],
  },
  'star-wars-characters': {
    title: 'Star Wars characters',
    category: 'movies',
    description:
      'Iconic Star Wars characters across the films & live-action shows.',
    tags: ['star wars', 'characters', 'sci-fi', 'jedi', 'sith'],
    labels: true,
  },
  'star-wars-heroes': {
    title: 'Star Wars heroes',
    category: 'movies',
    description:
      'Star Wars heroes & antiheroes — Jedi, Rebels, Resistance, Mandalorians, smugglers, droids, & redeemed allies.',
    tags: ['star wars', 'heroes', 'jedi', 'rebels', 'resistance'],
    labels: true,
    itemLabels: {
      '008-r2-d2.png': 'R2-D2',
      '009-c-3po.png': 'C-3PO',
      '020-bb-8.jpg': 'BB-8',
      '026-k-2so.jpg': 'K-2SO',
      '027-bo-katan-kryze.jpg': 'Bo-Katan Kryze',
      '034-wicket-w-warrick.png': 'Wicket W. Warrick',
      '040-ig-11.png': 'IG-11',
      '047-ki-adi-mundi.png': 'Ki-Adi-Mundi',
      '060-l3-37.png': 'L3-37',
      '065-b2emo.png': 'B2EMO',
    },
  },
  'star-wars-villains': {
    title: 'Star Wars villains',
    category: 'movies',
    description:
      'Star Wars villains — Sith Lords, Imperial brass, First Order leaders, Inquisitors, bounty hunters, & assorted scum.',
    tags: ['star wars', 'villains', 'sith', 'empire', 'first order'],
    labels: true,
    itemLabels: {
      '034-qira.png': "Qi'ra",
    },
  },
  'star-wars-supporting-characters': {
    title: 'Star Wars supporting characters',
    category: 'movies',
    description:
      'Star Wars supporting cast — family, civilians, comic relief, traders, pirates, & non-combatant allies across the saga.',
    tags: ['star wars', 'supporting', 'characters', 'civilians', 'side'],
    labels: true,
  },
} satisfies Record<string, FolderMeta>
