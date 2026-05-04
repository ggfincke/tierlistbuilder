// src/features/marketplace/components/CreateTile.tsx
// dashed grid tile that opens the publish-from-board modal — sits in the
// first slot of the gallery grid as a tiermaker-style "Create new" anchor

import { Plus } from 'lucide-react'

interface CreateTileProps
{
  onClick: () => void
  onIntent?: () => void
  size?: 'small' | 'default' | 'large'
}

const HEIGHT: Record<NonNullable<CreateTileProps['size']>, string> = {
  small: 'min-h-[200px]',
  default: 'min-h-[260px]',
  large: 'min-h-[320px]',
}

export const CreateTile = ({
  onClick,
  onIntent,
  size = 'default',
}: CreateTileProps) => (
  <button
    type="button"
    onClick={onClick}
    onFocus={onIntent}
    onPointerEnter={onIntent}
    className={`focus-custom group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-8 text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${HEIGHT[size]}`}
  >
    <span
      aria-hidden="true"
      className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text)] group-hover:bg-[var(--t-bg-hover)]"
    >
      <Plus className="h-6 w-6" strokeWidth={1.8} />
    </span>
    <span className="text-sm font-semibold">Create new template</span>
    <span className="text-xs text-[var(--t-text-faint)]">
      Publish from one of your boards
    </span>
  </button>
)
