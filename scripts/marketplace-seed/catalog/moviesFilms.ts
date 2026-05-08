// scripts/marketplace-seed/catalog/moviesFilms.ts
// film metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const MOVIES_FILMS_TEMPLATE_META = {
  'pixar-films': {
    title: 'Pixar feature films',
    category: 'movies',
    description: 'Every Pixar Animation Studios feature, by poster.',
    tags: ['pixar', 'animation', 'films'],
  },
  'studio-ghibli': {
    title: 'Studio Ghibli films',
    category: 'movies',
    description: 'Every Studio Ghibli theatrical feature, by poster.',
    tags: ['ghibli', 'animation', 'films'],
  },
  'james-bond-films': {
    title: 'James Bond films',
    category: 'movies',
    description:
      'All 25 Eon-produced 007 films from Dr. No (1962) to No Time to Die (2021).',
    tags: ['movies', 'james bond', '007', 'spy', 'action'],
  },
  'christopher-nolan-films': {
    title: 'Christopher Nolan films',
    category: 'movies',
    description:
      'Every Christopher Nolan feature, from Following (1998) to Oppenheimer (2023).',
    tags: ['movies', 'christopher nolan', 'director', 'filmography'],
  },
  'quentin-tarantino-films': {
    title: 'Quentin Tarantino films',
    category: 'movies',
    description:
      'Tarantino features from Reservoir Dogs (1992) through Once Upon a Time in Hollywood (2019).',
    tags: ['movies', 'quentin tarantino', 'director', 'filmography'],
  },
  'a24-films': {
    title: 'A24 films',
    category: 'movies',
    description:
      'Iconic A24-distributed films from Spring Breakers (2013) through The Brutalist (2024) — horror, indie drama, & arthouse hits.',
    tags: ['movies', 'a24', 'indie', 'arthouse', 'distributor'],
  },
  'wes-anderson-films': {
    title: 'Wes Anderson films',
    category: 'movies',
    description:
      'Every Wes Anderson feature, from Bottle Rocket (1996) through The Phoenician Scheme (2025).',
    tags: ['movies', 'wes anderson', 'director', 'filmography', 'indie'],
  },
  'coen-brothers-films': {
    title: 'Coen Brothers films',
    category: 'movies',
    description:
      'Joel & Ethan Coen features from Blood Simple (1984) through The Ballad of Buster Scruggs (2018).',
    tags: ['movies', 'coen brothers', 'director', 'filmography'],
  },
  'pixar-characters': {
    title: 'Pixar characters',
    category: 'movies',
    description: 'Iconic characters from across the Pixar filmography.',
    tags: ['pixar', 'characters', 'animation', 'disney'],
    labels: true,
  },
  'disney-animated-films': {
    title: 'Disney animated features',
    category: 'movies',
    description:
      'Walt Disney Animation Studios feature films from Snow White through Zootopia 2.',
    tags: ['disney', 'animation', 'films'],
  },
  'dreamworks-films': {
    title: 'DreamWorks Animation films',
    category: 'movies',
    description:
      'DreamWorks Animation theatrical features from Antz through Gabby’s Dollhouse: The Movie.',
    tags: ['dreamworks', 'animation', 'films'],
  },
  'horror-movie-franchises': {
    title: 'Horror movie franchises',
    category: 'movies',
    description:
      'Major horror franchises from Halloween and Friday the 13th through modern series like Terrifier and A Quiet Place.',
    tags: ['horror', 'movies', 'franchises'],
  },
  'best-picture-winners': {
    title: 'Best Picture winners',
    category: 'movies',
    description:
      'Academy Award Best Picture winners from American Beauty (2000 ceremony) through One Battle After Another (2026 ceremony).',
    tags: ['oscars', 'best picture', 'movies'],
  },
} satisfies Record<string, FolderMeta>
