// src/features/social/profile/ui/ProfileSectionHeader.tsx
// section heading row for profile sections: title + optional count & action

import type { ReactNode } from 'react'

interface ProfileSectionHeaderProps
{
  title: string
  count?: number | string
  action?: ReactNode
}

export const ProfileSectionHeader = ({
  title,
  count,
  action,
}: ProfileSectionHeaderProps) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h2 className="flex items-baseline gap-2">
      <span className="text-[15px] font-bold text-[var(--t-text)]">
        {title}
      </span>
      {count !== undefined && (
        <span className="mono text-[12px] text-[var(--t-text-faint)]">
          {count}
        </span>
      )}
    </h2>
    {action}
  </div>
)
