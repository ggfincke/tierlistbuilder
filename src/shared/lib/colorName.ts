// src/shared/lib/colorName.ts
// approximate human-readable color names from hex values for a11y labels

import { hexToRgbColor } from './color'

interface NamedColor
{
  r: number
  g: number
  b: number
  name: string
}

const NAMED_COLORS: NamedColor[] = [
  { r: 0, g: 0, b: 0, name: 'black' },
  { r: 255, g: 255, b: 255, name: 'white' },
  { r: 128, g: 128, b: 128, name: 'gray' },
  { r: 192, g: 192, b: 192, name: 'silver' },
  { r: 255, g: 0, b: 0, name: 'red' },
  { r: 178, g: 34, b: 34, name: 'dark red' },
  { r: 255, g: 99, b: 71, name: 'tomato' },
  { r: 255, g: 127, b: 80, name: 'coral' },
  { r: 255, g: 69, b: 0, name: 'orange red' },
  { r: 255, g: 165, b: 0, name: 'orange' },
  { r: 255, g: 200, b: 0, name: 'golden yellow' },
  { r: 255, g: 255, b: 0, name: 'yellow' },
  { r: 154, g: 205, b: 50, name: 'yellow green' },
  { r: 0, g: 128, b: 0, name: 'green' },
  { r: 0, g: 100, b: 0, name: 'dark green' },
  { r: 50, g: 205, b: 50, name: 'lime green' },
  { r: 0, g: 255, b: 0, name: 'lime' },
  { r: 0, g: 128, b: 128, name: 'teal' },
  { r: 0, g: 255, b: 255, name: 'cyan' },
  { r: 70, g: 130, b: 180, name: 'steel blue' },
  { r: 0, g: 0, b: 255, name: 'blue' },
  { r: 0, g: 0, b: 139, name: 'dark blue' },
  { r: 100, g: 149, b: 237, name: 'cornflower blue' },
  { r: 135, g: 206, b: 235, name: 'sky blue' },
  { r: 75, g: 0, b: 130, name: 'indigo' },
  { r: 128, g: 0, b: 128, name: 'purple' },
  { r: 148, g: 103, b: 189, name: 'medium purple' },
  { r: 238, g: 130, b: 238, name: 'violet' },
  { r: 255, g: 0, b: 255, name: 'magenta' },
  { r: 255, g: 105, b: 180, name: 'hot pink' },
  { r: 255, g: 192, b: 203, name: 'pink' },
  { r: 165, g: 42, b: 42, name: 'brown' },
  { r: 210, g: 180, b: 140, name: 'tan' },
  { r: 245, g: 222, b: 179, name: 'wheat' },
  { r: 255, g: 228, b: 196, name: 'bisque' },
  { r: 128, g: 0, b: 0, name: 'maroon' },
]

// find the closest named color via euclidean distance in RGB space
export const getColorName = (hex: string): string =>
{
  const rgb = hexToRgbColor(hex)
  if (!rgb) return hex

  let bestName = hex
  let bestDist = Infinity

  for (const named of NAMED_COLORS)
  {
    const dr = rgb.red - named.r
    const dg = rgb.green - named.g
    const db = rgb.blue - named.b
    const dist = dr * dr + dg * dg + db * db

    if (dist < bestDist)
    {
      bestDist = dist
      bestName = named.name
    }
  }

  return bestName
}
