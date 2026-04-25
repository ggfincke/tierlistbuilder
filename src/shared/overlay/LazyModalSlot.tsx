// src/shared/overlay/LazyModalSlot.tsx
// Suspense & error boundary shell for lazy-loaded modals

import { Suspense, type ReactNode } from 'react'

import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { BaseModal } from './BaseModal'

interface LazyModalSlotProps<T>
{
  when: T | null | undefined | false
  section: string
  children: (trigger: NonNullable<T>) => ReactNode
}

const LazyModalFallback = ({ section }: { section: string }) => (
  <BaseModal
    open
    ariaLabel={`Loading ${section}`}
    closeOnEscape={false}
    closeOnBackdrop={false}
    panelClassName="w-64 px-5 py-4"
  >
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span className="h-4 w-4 rounded-full border-2 border-[var(--t-border-secondary)] border-t-[var(--t-accent)] motion-safe:animate-spin" />
      <span className="text-sm text-[var(--t-text-secondary)]">Loading...</span>
    </div>
  </BaseModal>
)

export const LazyModalSlot = <T,>({
  when,
  section,
  children,
}: LazyModalSlotProps<T>) =>
{
  if (!when) return null

  return (
    <Suspense fallback={<LazyModalFallback section={section} />}>
      <ErrorBoundary section={section}>
        {children(when as NonNullable<T>)}
      </ErrorBoundary>
    </Suspense>
  )
}
