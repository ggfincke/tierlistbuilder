// src/shared/overlay/DialogActions.tsx
// right-aligned modal action row

import type { ReactNode } from 'react'

interface DialogActionsProps
{
  children: ReactNode
  className?: string
}

export const DialogActions = ({
  children,
  className = 'mt-4 flex justify-end gap-2',
}: DialogActionsProps) => <div className={className}>{children}</div>
