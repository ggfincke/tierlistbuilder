// src/features/marketplace/ui/discovery/RailHeader.tsx
// section heading w/ optional icon, mono shelf-stat (meta), & action link
// (eg "See all -"). both right-side affordances optional

import type { ComponentType, ReactNode, SVGProps } from 'react'

interface RailHeaderProps
{
  title: string
  subtitle?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  // editorial shelf-stat — typically a mono count ("12 trending"). renders
  // right-aligned & visually demoted so it reads as context, not action
  meta?: ReactNode
  // CTA-style affordance (eg "See all -"). renders next to meta when both set
  action?: ReactNode
}

export const RailHeader = ({
  title,
  subtitle,
  icon: Icon,
  meta,
  action,
}: RailHeaderProps) => (
  <div className="mb-3 flex items-end justify-between gap-3">
    <div className="flex items-center gap-3">
      {Icon && (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] text-[var(--t-text-secondary)]"
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      )}
      <div>
        <h2 className="text-lg font-bold tracking-[-0.015em] text-[var(--t-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--t-text-faint)]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {(meta !== undefined && meta !== null) || action ? (
      <div className="flex items-center gap-3 text-xs">
        {meta !== undefined && meta !== null && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)] tabular-nums"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            {meta}
          </span>
        )}
        {action && <div>{action}</div>}
      </div>
    ) : null}
  </div>
)
