// src/features/marketplace/ui/discovery/ConsensusShell.tsx
// shared two-column layout for consensus body, rail, toolbar, & actions

import type { ReactNode } from 'react'

interface ConsensusShellProps
{
  actions: ReactNode
  body: ReactNode
  rail: ReactNode
  toolbar: ReactNode
}

export const ConsensusShell = ({
  actions,
  body,
  rail,
  toolbar,
}: ConsensusShellProps) => (
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto] lg:items-stretch">
    <div className="min-w-0 lg:col-start-1 lg:row-start-1">{toolbar}</div>
    <div className="lg:col-start-2 lg:row-start-1">{actions}</div>
    <div className="min-w-0 lg:col-start-1 lg:row-start-2">{body}</div>
    <aside className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)]">
      {rail}
    </aside>
  </div>
)
