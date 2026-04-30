// src/features/library/components/VisibilityChip.tsx
// public/private icon + label chip used on cards & list rows

import { Globe2, Lock } from 'lucide-react'

import type { LibraryBoardVisibility } from '@tierlistbuilder/contracts/workspace/board'

interface VisibilityChipProps
{
  visibility: LibraryBoardVisibility
}

const META: Record<
  LibraryBoardVisibility,
  { label: string; Icon: typeof Globe2 }
> = {
  public: { label: 'Public', Icon: Globe2 },
  private: { label: 'Private', Icon: Lock },
}

export const VisibilityChip = ({ visibility }: VisibilityChipProps) =>
{
  const { label, Icon } = META[visibility]
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-[var(--t-text-muted)]"
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
      {label}
    </span>
  )
}
