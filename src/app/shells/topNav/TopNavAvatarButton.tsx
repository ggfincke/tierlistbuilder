// src/app/shells/topNav/TopNavAvatarButton.tsx
// circular avatar trigger for the global account menu — Scoreboard styling
// (sits outside the segmented surface-nav pill as a standalone capsule).

import { User } from 'lucide-react'

interface TopNavAvatarButtonProps
{
  label: string
  menuOpen: boolean
  menuId: string
  initial?: string
  onToggle: () => void
}

export const TopNavAvatarButton = ({
  label,
  menuOpen,
  menuId,
  initial,
  onToggle,
}: TopNavAvatarButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={menuOpen}
    aria-controls={menuId}
    onClick={onToggle}
    className="focus-custom pointer-events-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 text-[11px] font-semibold text-[var(--t-text)] backdrop-blur transition hover:border-[var(--t-border-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    {initial ? (
      <span>{initial}</span>
    ) : (
      <User
        className="h-4 w-4 text-[var(--t-text-muted)]"
        strokeWidth={1.8}
        aria-hidden
      />
    )}
  </button>
)
