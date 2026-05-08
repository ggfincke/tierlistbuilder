// scripts/marketplace-seed/catalog/music.ts
// music example metadata for marketplace template seeds

import type { FolderMeta } from '../types'

export const MUSIC_TEMPLATE_META = {
  'taylor-swift-albums': {
    title: 'Taylor Swift studio albums',
    category: 'music',
    description:
      "All of Taylor Swift's studio albums, including re-recordings.",
    tags: ['taylor swift', 'pop', 'albums'],
  },
  'beatles-albums': {
    title: 'The Beatles studio albums',
    category: 'music',
    description: 'Every Beatles studio album, by cover.',
    tags: ['the beatles', 'rock', 'albums'],
  },
  'kendrick-lamar-albums': {
    title: 'Kendrick Lamar studio albums',
    category: 'music',
    description:
      "Kendrick Lamar's studio discography, plus Overly Dedicated and the Black Panther soundtrack he curated.",
    tags: ['kendrick lamar', 'hip hop', 'albums'],
  },
  'beyonce-albums': {
    title: 'Beyoncé studio albums',
    category: 'music',
    description:
      "Beyoncé's studio discography from Dangerously in Love through Cowboy Carter, plus Everything Is Love and The Lion King: The Gift.",
    tags: ['beyonce', 'pop', 'albums'],
  },
  'top-rap-albums': {
    title: 'Top rap albums',
    category: 'music',
    description:
      '100 widely-cited classic and modern rap albums, from Raising Hell (1986) through GNX (2024).',
    tags: ['hip hop', 'rap', 'albums'],
  },
  'kanye-albums': {
    title: 'Kanye West albums',
    category: 'music',
    description:
      "Kanye's solo studio discography plus the Watch the Throne, Cruel Summer, Kids See Ghosts, and Vultures collaborations.",
    tags: ['kanye west', 'hip hop', 'albums'],
  },
  'nirvana-albums': {
    title: 'Nirvana albums',
    category: 'music',
    description:
      'Every Nirvana studio album plus the major posthumous live and compilation releases.',
    tags: ['nirvana', 'grunge', 'albums'],
  },
  'the-strokes-albums': {
    title: 'The Strokes albums',
    category: 'music',
    description:
      'Every Strokes studio album from Is This It through The New Abnormal.',
    tags: ['the strokes', 'indie rock', 'albums'],
  },
  'mgmt-albums': {
    title: 'MGMT albums',
    category: 'music',
    description:
      'Every MGMT studio album from Oracular Spectacular through Loss of Life.',
    tags: ['mgmt', 'indie', 'albums'],
  },
  'voidz-albums': {
    title: 'The Voidz albums',
    category: 'music',
    description:
      'Every Voidz studio album from Tyranny through Like All Before You, plus the 2025 Męğż Øf Råm EP.',
    tags: ['the voidz', 'rock', 'albums'],
  },
  'drake-albums': {
    title: 'Drake albums',
    category: 'music',
    description:
      "Drake's studio discography from Thank Me Later through $ome $exy $ongs 4 U, plus the IYRTITL and What a Time to Be Alive collaborations.",
    tags: ['drake', 'hip hop', 'albums'],
  },
  'eminem-albums': {
    title: 'Eminem albums',
    category: 'music',
    description:
      'Every Eminem studio album from Infinite (1996) through The Death of Slim Shady.',
    tags: ['eminem', 'hip hop', 'albums'],
  },
  'queen-albums': {
    title: 'Queen studio albums',
    category: 'music',
    description:
      'Every Queen studio album from the 1973 self-titled debut through Made in Heaven.',
    tags: ['queen', 'rock', 'albums'],
  },
  'pink-floyd-albums': {
    title: 'Pink Floyd studio albums',
    category: 'music',
    description:
      'Every Pink Floyd studio album from The Piper at the Gates of Dawn through The Endless River.',
    tags: ['pink floyd', 'rock', 'albums'],
  },
  'led-zeppelin-albums': {
    title: 'Led Zeppelin studio albums',
    category: 'music',
    description:
      'Every Led Zeppelin studio album from the 1969 debut through the posthumous Coda.',
    tags: ['led zeppelin', 'rock', 'albums'],
  },
  'metallica-albums': {
    title: 'Metallica albums',
    category: 'music',
    description:
      "Metallica's studio discography plus Garage Inc. and the Lou Reed collaboration Lulu.",
    tags: ['metallica', 'metal', 'albums'],
  },
  'lady-gaga-albums': {
    title: 'Lady Gaga albums',
    category: 'music',
    description:
      'Every Lady Gaga studio album from The Fame through Mayhem, including the Tony Bennett duets and the A Star Is Born and Harlequin companion albums.',
    tags: ['lady gaga', 'pop', 'albums'],
  },
  'the-weeknd-albums': {
    title: 'The Weeknd albums',
    category: 'music',
    description:
      "The Weeknd's Trilogy mixtapes plus every studio album from Kiss Land through Hurry Up Tomorrow.",
    tags: ['the weeknd', 'r&b', 'albums'],
  },
  'daft-punk-albums': {
    title: 'Daft Punk albums',
    category: 'music',
    description:
      'Every Daft Punk studio album, plus the Tron: Legacy soundtrack.',
    tags: ['daft punk', 'electronic', 'albums'],
  },
  'radiohead-albums': {
    title: 'Radiohead albums',
    category: 'music',
    description:
      'Every Radiohead studio album from Pablo Honey through A Moon Shaped Pool.',
    tags: ['radiohead', 'rock', 'albums'],
  },
  'michael-jackson-albums': {
    title: 'Michael Jackson albums',
    category: 'music',
    description:
      'Every Michael Jackson solo studio album from Got to Be There through the posthumous Xscape.',
    tags: ['michael jackson', 'pop', 'albums'],
  },
  'music-genres': {
    title: 'Music genres',
    category: 'music',
    description:
      'Music genres as black-square text cards, spanning core umbrellas and subgenres across rock, pop, hip hop, electronic, metal, jazz, latin, and world music.',
    tags: ['music', 'genres'],
  },
  'music-festivals': {
    title: 'Music festivals',
    category: 'music',
    description:
      'Music festivals from Wikipedia, spanning mainstream (Coachella, Lollapalooza), European rock (Glastonbury, Wacken), EDM (Tomorrowland, EDC), genre festivals (Stagecoach, Newport Folk, Montreux Jazz), and defunct touring icons (Warped Tour, Ozzfest).',
    tags: ['music', 'festivals'],
    labels: true,
  },
  'grammy-album-of-the-year': {
    title: 'Grammy Album of the Year winners',
    category: 'music',
    description:
      'Every Grammy Album of the Year winner from 1959 (The Music from Peter Gunn) through 2026 (Debí Tirar Más Fotos), spanning jazz, rock, pop, country, folk, hip-hop, and Latin.',
    tags: ['grammy', 'album of the year', 'music'],
  },
} satisfies Record<string, FolderMeta>
