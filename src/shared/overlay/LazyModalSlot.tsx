// src/shared/overlay/LazyModalSlot.tsx
// gated Suspense + ErrorBoundary for lazy modals; collapses the repeated
// `{when && <Suspense><ErrorBoundary>…</ErrorBoundary></Suspense>}` shell

import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

interface LazyModalSlotProps<T>
{
  when: T | null | undefined | false
  section: string
  children: (trigger: NonNullable<T>) => ReactNode
}

export const LazyModalSlot = <T,>({
  when,
  section,
  children,
}: LazyModalSlotProps<T>) =>
{
  if (!when) return null

  return (
    <Suspense>
      <ErrorBoundary section={section}>
        {children(when as NonNullable<T>)}
      </ErrorBoundary>
    </Suspense>
  )
}
