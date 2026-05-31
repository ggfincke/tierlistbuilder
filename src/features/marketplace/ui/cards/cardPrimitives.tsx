// src/features/marketplace/ui/cards/cardPrimitives.tsx
// small marketplace card primitives shared by cards & detail surfaces

import type { ComponentType, ReactNode, SVGProps } from 'react'

import { formatCount } from '~/shared/catalog/formatters'

interface InlineCardStatProps
{
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: number
}

export const InlineCardStat = ({
  icon: Icon,
  label,
  value,
}: InlineCardStatProps) => (
  <span
    className={`inline-flex items-center gap-1 tabular-nums ${
      value <= 0 ? 'text-[var(--t-text-dim)]' : 'text-[var(--t-text-faint)]'
    }`}
    style={{ fontFamily: 'var(--ts-mono)' }}
    title={`${value} ${label}`}
  >
    <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
    {formatCount(value)}
  </span>
)

interface DetailStatTileProps
{
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: string
}

export const DetailStatTile = ({
  icon: Icon,
  label,
  value,
}: DetailStatTileProps) => (
  <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-2.5">
    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
      <Icon className="h-3 w-3" strokeWidth={1.8} />
      {label}
    </span>
    <p className="mt-1 text-lg font-semibold text-[var(--t-text)]">{value}</p>
  </div>
)

interface OverlayChipProps
{
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  alignEnd?: boolean
  children: ReactNode
}

export const OverlayChip = ({
  icon: Icon,
  alignEnd = false,
  children,
}: OverlayChipProps) => (
  <span
    className={`${alignEnd ? 'ml-auto ' : ''}inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm`}
    style={{ fontFamily: 'var(--ts-mono)' }}
  >
    {Icon && <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
    {children}
  </span>
)
