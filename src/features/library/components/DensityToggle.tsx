// src/features/library/components/DensityToggle.tsx
// 3-segment dense/default/loose control for the grid view; hidden in list view

import { Maximize2, Minimize2, MoreHorizontal } from 'lucide-react'

import {
  LIBRARY_BOARD_DENSITIES,
  type LibraryBoardDensity,
} from '@tierlistbuilder/contracts/workspace/board'

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

export const DensityToggle = ({ density, onChange }: DensityToggleProps) => (
  <div
    className="flex items-center gap-0.5 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] p-1"
    role="radiogroup"
    aria-label="Choose card density"
  >
    {LIBRARY_BOARD_DENSITIES.map((id) =>
    {
      const active = density === id
      const { label, Icon } = META[id]
      return (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={
            active
              ? 'focus-custom flex h-7 w-7 items-center justify-center rounded-full bg-[var(--t-text)] text-[var(--t-bg-page)] transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
              : 'focus-custom flex h-7 w-7 items-center justify-center rounded-full text-[var(--t-text-muted)] transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
          }
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )
    })}
  </div>
)
