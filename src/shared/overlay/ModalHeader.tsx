// src/shared/overlay/ModalHeader.tsx
// canonical modal heading primitive

import type { ReactNode } from 'react'

interface ModalHeaderProps
{
  titleId: string
  children: ReactNode
  className?: string
}

export const ModalHeader = ({
  titleId,
  children,
  className = 'text-lg font-semibold text-[var(--t-text)]',
}: ModalHeaderProps) => (
  <h2 id={titleId} className={className}>
    {children}
  </h2>
)
