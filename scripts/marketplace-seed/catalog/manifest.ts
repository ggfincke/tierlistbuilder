// scripts/marketplace-seed/catalog/manifest.ts
// combined metadata manifest for marketplace template seeds

import { FOOD_TEMPLATE_META } from './food'
import { BOOKS_TEMPLATE_META } from './books'
import { ANIME_SERIES_TEMPLATE_META } from './animeSeries'
import { ANIME_CHARACTERS_TEMPLATE_META } from './animeCharacters'
import { GAMING_TEMPLATE_META } from './gaming'
import { TECH_DEV_TEMPLATE_META } from './techDev'
import { TECH_APPS_TEMPLATE_META } from './techApps'
import { TECH_COMPANIES_TEMPLATE_META } from './techCompanies'
import { MOVIES_MARVEL_TEMPLATE_META } from './moviesMarvel'
import { MOVIES_STAR_WARS_TEMPLATE_META } from './moviesStarWars'
import { MOVIES_TV_TEMPLATE_META } from './moviesTv'
import { MOVIES_FILMS_TEMPLATE_META } from './moviesFilms'
import { SPORTS_TEMPLATE_META } from './sports'
import { MUSIC_TEMPLATE_META } from './music'
import { OTHER_TRAVEL_TEMPLATE_META } from './otherTravel'
import { OTHER_CULTURE_TEMPLATE_META } from './otherCulture'
import type { FolderMeta } from '../types'

export const TEMPLATE_META: Readonly<Record<string, FolderMeta>> = {
  ...FOOD_TEMPLATE_META,
  ...BOOKS_TEMPLATE_META,
  ...ANIME_SERIES_TEMPLATE_META,
  ...ANIME_CHARACTERS_TEMPLATE_META,
  ...GAMING_TEMPLATE_META,
  ...TECH_DEV_TEMPLATE_META,
  ...TECH_APPS_TEMPLATE_META,
  ...TECH_COMPANIES_TEMPLATE_META,
  ...MOVIES_MARVEL_TEMPLATE_META,
  ...MOVIES_STAR_WARS_TEMPLATE_META,
  ...MOVIES_TV_TEMPLATE_META,
  ...MOVIES_FILMS_TEMPLATE_META,
  ...SPORTS_TEMPLATE_META,
  ...MUSIC_TEMPLATE_META,
  ...OTHER_TRAVEL_TEMPLATE_META,
  ...OTHER_CULTURE_TEMPLATE_META,
} satisfies Record<string, FolderMeta>
