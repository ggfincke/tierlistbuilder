// src/features/marketplace/components/RailHeader.tsx
// section heading w/ optional icon for the gallery's horizontal rails

import type { ComponentType, ReactNode, SVGProps } from 'react'

interface RailHeaderProps
{
  title: string
  subtitle?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  action?: ReactNode
}

export const RailHeader = ({
  title,
  subtitle,
  icon: Icon,
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
        <h2 className="text-lg font-semibold tracking-tight text-[var(--t-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--t-text-faint)]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && <div className="text-xs">{action}</div>}
  </div>
)
