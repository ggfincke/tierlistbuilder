// src/features/library/components/chrome/DensityToggle.tsx
// 3-segment dense/default/loose control for the grid view; hidden in list view

import { Maximize2, Minimize2, MoreHorizontal } from 'lucide-react'

import {
  LIBRARY_BOARD_DENSITIES,
  type LibraryBoardDensity,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  IconToggleGroup,
  type IconToggleOption,
} from '~/shared/ui/IconToggleGroup'

interface DensityToggleProps
{
  density: LibraryBoardDensity
  onChange: (next: LibraryBoardDensity) => void
}

const META: Record<
  LibraryBoardDensity,
  { label: string; Icon: typeof Maximize2 }
> = {
  dense: { label: 'Dense layout', Icon: Minimize2 },
  default: { label: 'Default layout', Icon: MoreHorizontal },
  loose: { label: 'Loose layout', Icon: Maximize2 },
}

const OPTIONS: IconToggleOption<LibraryBoardDensity>[] =
  LIBRARY_BOARD_DENSITIES.map((value) => ({
    value,
    ...META[value],
  }))

export const DensityToggle = ({ density, onChange }: DensityToggleProps) => (
  <IconToggleGroup
    value={density}
    options={OPTIONS}
    onChange={onChange}
    ariaLabel="Choose card density"
  />
)
