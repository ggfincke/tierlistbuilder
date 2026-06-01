// src/features/library/ui/chrome/DensityToggle.tsx
// 3-segment dense/default/loose control for the grid view; hidden in list view

import { Columns2, Columns3, Columns4 } from 'lucide-react'

import {
  LIBRARY_BOARD_DENSITIES,
  type LibraryBoardDensity,
} from '@tierlistbuilder/contracts/workspace/libraryBoard'

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
  { label: string; Icon: typeof Columns4 }
> = {
  dense: { label: 'Dense layout (4 columns)', Icon: Columns4 },
  default: { label: 'Default layout (3 columns)', Icon: Columns3 },
  loose: { label: 'Loose layout (2 columns)', Icon: Columns2 },
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
