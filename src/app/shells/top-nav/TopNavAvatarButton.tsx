// src/app/shells/top-nav/TopNavAvatarButton.tsx
// circular avatar trigger for the global account menu

import { User } from 'lucide-react'

import { Avatar } from '~/shared/ui/Avatar'

interface TopNavAvatarButtonProps
{
  label: string
  menuOpen: boolean
  menuId: string
  name?: string
  src?: string | null
  onToggle: () => void
}

export const TopNavAvatarButton = ({
  label,
  menuOpen,
  menuId,
  name,
  src,
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
    {name ? (
      <Avatar name={name} src={src} size="fill" variant="gradient" />
    ) : (
      <User
        className="h-4 w-4 text-[var(--t-text-muted)]"
        strokeWidth={1.8}
        aria-hidden
      />
    )}
  </button>
)
