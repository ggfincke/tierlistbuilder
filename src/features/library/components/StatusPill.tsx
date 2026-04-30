// src/features/library/components/StatusPill.tsx
// status indicator pill — semantic dot + label; in-progress state pulses

import type { LibraryBoardStatus } from '@tierlistbuilder/contracts/workspace/board'

import { LIBRARY_STATUS_META } from '~/features/library/lib/statusMeta'

interface StatusPillProps
{
  status: LibraryBoardStatus
  size?: 'sm' | 'md'
}

export const StatusPill = ({ status, size = 'sm' }: StatusPillProps) =>
{
  const meta = LIBRARY_STATUS_META[status]
  const padding = size === 'sm' ? 'px-2 py-[2px]' : 'px-2.5 py-[3px]'
  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--t-overlay)/0.08)] bg-[rgb(var(--t-overlay)/0.04)] font-medium ${padding} ${fontSize}`}
      style={{ color: meta.textColor }}
    >
      <span
        aria-hidden="true"
        className={
          status === 'in_progress'
            ? 'inline-block h-1.5 w-1.5 rounded-full motion-safe:animate-pulse'
            : 'inline-block h-1.5 w-1.5 rounded-full'
        }
        style={{ backgroundColor: meta.dotColor }}
      />
      {meta.label}
    </span>
  )
}
