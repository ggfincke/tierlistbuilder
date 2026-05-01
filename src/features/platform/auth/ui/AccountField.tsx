// src/features/platform/auth/ui/AccountField.tsx
// shared label, hint, & control wrapper for account-management fields

import type { ReactNode } from 'react'

interface AccountFieldProps
{
  labelId: string
  label: string
  hint?: string
  children: ReactNode
}

export const AccountField = ({
  labelId,
  label,
  hint,
  children,
}: AccountFieldProps) => (
  <div className="space-y-1">
    <div className="flex items-baseline justify-between">
      <label
        htmlFor={labelId}
        className="block text-xs font-medium text-[var(--t-text-muted)]"
      >
        {label}
      </label>
      {hint && (
        <span className="text-[10px] text-[var(--t-text-faint)]">{hint}</span>
      )}
    </div>
    {children}
  </div>
)
