// src/features/marketplace/ui/consensus/views/LoadingBlock.tsx
// dashed-border placeholder for "loading" / "computing" states across
// consensus surfaces. callers tweak radius/min-height via className

import { Loader2 } from 'lucide-react'

interface LoadingBlockProps
{
  message: string
  // overrides default `rounded-lg`. used by callers that need rounded-xl
  // (compare page) or extra min-height (lane loader)
  className?: string
}

export const LoadingBlock = ({
  message,
  className = 'rounded-lg',
}: LoadingBlockProps) => (
  <div
    className={`flex items-center justify-center gap-2 ${className} border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-5 py-8 text-sm text-[var(--t-text-muted)]`}
  >
    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
    {message}
  </div>
)
