// scripts/marketplace-seed/catalog/sports.ts
// sports example metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const SPORTS_TEMPLATE_META = {
  'nba-teams': {
    title: 'NBA teams',
    category: 'sports',
    description: 'All 30 NBA franchises, by primary team logo.',
    tags: ['basketball', 'nba'],
  },
  'nfl-teams': {
    title: 'NFL teams',
    category: 'sports',
    description: 'All 32 NFL franchises, by primary team logo.',
    tags: ['football', 'nfl'],
  },
  'premier-league-clubs': {
    title: 'Premier League clubs',
    category: 'sports',
    description: 'Every active Premier League club for the current season.',
    tags: ['football', 'soccer', 'premier league'],
  },
  'formula-1-teams': {
    title: 'Formula 1 teams',
    category: 'sports',
    description:
      'The 2026 Formula 1 grid, including Cadillac as the eleventh team.',
    tags: ['formula 1', 'f1', 'racing'],
  },
  'mlb-teams': {
    title: 'MLB teams',
    category: 'sports',
    description: 'All 30 Major League Baseball franchises.',
    tags: ['baseball', 'mlb', 'teams'],
  },
  'nhl-teams': {
    title: 'NHL teams',
    category: 'sports',
    description:
      'All 32 National Hockey League franchises, including Utah Mammoth as the current Utah identity.',
    tags: ['hockey', 'nhl', 'teams'],
  },
  'wwe-wrestlers': {
    title: 'WWE wrestlers',
    category: 'sports',
    description:
      'A mix of current WWE stars, women’s division, and Hall of Fame icons.',
    tags: ['wwe', 'wrestling', 'sports entertainment'],
  },
} satisfies Record<string, FolderMeta>
