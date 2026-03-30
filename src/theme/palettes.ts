// src/theme/palettes.ts
// coordinated tier label palettes — ordered swatches per palette

import type { PaletteId, ThemeId } from '../types'

export interface PaletteDefinition
{
  // ordered swatches used by both the picker UI & stored palette indices
  colors: string[]
}

export const PALETTES: Record<PaletteId, PaletteDefinition> = {
  classic: {
    colors: [
      '#FF7F7E',
      '#FFBF81',
      '#FFDF80',
      '#FEFF7F',
      '#C1FF80',
      '#7EFF80',
      '#7FFFFF',
      '#7EBFFF',
      '#807FFF',
      '#FF7FFE',
      '#BF7EBE',
      '#3B3B3B',
      '#858585',
      '#CFCFCF',
      '#F7F7F7',
    ],
  },
  ocean: {
    colors: [
      '#0ea5e9',
      '#38bdf8',
      '#67e8f9',
      '#22d3ee',
      '#06b6d4',
      '#14b8a6',
      '#5eead4',
      '#a7f3d0',
      '#6ee7b7',
      '#2dd4bf',
      '#0d9488',
      '#d4c8a0',
      '#94a3b8',
      '#475569',
      '#1e3a5f',
    ],
  },
  midnight: {
    colors: [
      '#f0abfc',
      '#e879f9',
      '#c084fc',
      '#a78bfa',
      '#818cf8',
      '#60a5fa',
      '#38bdf8',
      '#22d3ee',
      '#67e8f9',
      '#5eead4',
      '#6ee7b7',
      '#94a3b8',
      '#cbd5e1',
      '#334155',
      '#1e293b',
    ],
  },
  forest: {
    colors: [
      '#d4a574',
      '#c4a882',
      '#c8a050',
      '#c8b860',
      '#b8c4a0',
      '#8faa7a',
      '#a8c060',
      '#80b870',
      '#6b8f71',
      '#5caa6c',
      '#4a8c5c',
      '#3d7050',
      '#8b7355',
      '#546850',
      '#2d3a28',
    ],
  },
  ember: {
    colors: [
      '#ef6044',
      '#f07050',
      '#f08050',
      '#f0a050',
      '#e8b860',
      '#f5d4a0',
      '#d4b878',
      '#c4a882',
      '#b89c70',
      '#c87858',
      '#8b7355',
      '#a05040',
      '#783828',
      '#635040',
      '#3d2e22',
    ],
  },
  sakura: {
    colors: [
      '#f472b6',
      '#e879a8',
      '#f0a0c0',
      '#f5c0d0',
      '#f0d0e0',
      '#e0b0c0',
      '#d8a0d0',
      '#c0a0d8',
      '#b8a0d8',
      '#a0a8d8',
      '#a0c0d8',
      '#d0c0d0',
      '#b8a3b0',
      '#8c7382',
      '#5e4452',
    ],
  },
  twilight: {
    colors: [
      '#F4845F',
      '#E86A7E',
      '#D45A9E',
      '#B85CB8',
      '#9465CE',
      '#7B6FDB',
      '#6078E0',
      '#4A8ADB',
      '#3D9ACE',
      '#35A8BE',
      '#3DB5A8',
      '#94a3b8',
      '#7080A0',
      '#4A5570',
      '#2C3344',
    ],
  },
  'high-contrast': {
    colors: [
      '#ff0000',
      '#ff8800',
      '#ffff00',
      '#88ff00',
      '#00cc00',
      '#00ff88',
      '#00ffff',
      '#0088ff',
      '#8800ff',
      '#ff00ff',
      '#ffffff',
      '#cccccc',
      '#888888',
      '#444444',
      '#000000',
    ],
  },
}

export interface PaletteMeta
{
  id: PaletteId
  label: string
}

export const PALETTE_META: PaletteMeta[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'forest', label: 'Forest' },
  { id: 'ember', label: 'Ember' },
  { id: 'sakura', label: 'Sakura' },
  { id: 'twilight', label: 'Twilight' },
  { id: 'high-contrast', label: 'High Contrast' },
]

// maps each theme to its tier label palette (classic-light shares classic)
export const THEME_PALETTE: Record<ThemeId, PaletteId> = {
  classic: 'classic',
  'classic-light': 'classic',
  midnight: 'midnight',
  forest: 'forest',
  ember: 'ember',
  sakura: 'sakura',
  amoled: 'twilight',
  'high-contrast': 'high-contrast',
}
