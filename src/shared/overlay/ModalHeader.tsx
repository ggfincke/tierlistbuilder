// src/shared/overlay/ModalHeader.tsx
// shared modal title — h2 w/ the canonical modal heading style

import type { ReactNode } from 'react'

interface ModalHeaderProps
{
  titleId: string
  children: ReactNode
  className?: string
}

// emits just the <h2>; callers keep their surrounding flex/layout wrapper
// so each modal can place close buttons & actions however it needs
export const ModalHeader = ({
  titleId,
  children,
  className = 'text-lg font-semibold text-[var(--t-text)]',
}: ModalHeaderProps) => (
  <h2 id={titleId} className={className}>
    {children}
  </h2>
)
