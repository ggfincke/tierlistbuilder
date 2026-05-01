// src/app/shells/topNav/TopNavAvatarButton.tsx
// circular avatar trigger for the global account menu

import { User } from 'lucide-react'

interface TopNavAvatarButtonProps
{
  initial: string | null
  imageUrl: string | null
  label: string
  menuOpen: boolean
  menuId: string
  onToggle: () => void
  loading?: boolean
}

export const TopNavAvatarButton = ({
  initial,
  imageUrl,
  label,
  menuOpen,
  menuId,
  onToggle,
  loading,
}: TopNavAvatarButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={menuOpen}
    aria-controls={menuId}
    onClick={onToggle}
    disabled={loading}
    className="focus-custom flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] text-[11px] font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : initial ? (
      initial
    ) : (
      <User
        className="h-4 w-4 text-[var(--t-text-muted)]"
        strokeWidth={1.8}
        aria-hidden
      />
    )}
  </button>
)
