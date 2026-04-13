// src/features/workspace/stats/ui/TierDistributionChart.tsx
// horizontal bar chart showing item count per tier w/ tier label colors

import { memo } from 'react'

import type { TierStat } from '@/features/workspace/stats/model/boardStats'
import { getTextColor } from '@/shared/lib/color'

interface TierDistributionChartProps
{
  distribution: TierStat[]
  maxCount: number
}

export const TierDistributionChart = memo(
  ({ distribution, maxCount }: TierDistributionChartProps) =>
  {
    if (distribution.length === 0)
    {
      return (
        <p className="py-4 text-center text-sm text-[var(--t-text-muted)]">
          No items to chart.
        </p>
      )
    }

    return (
      <div
        role="img"
        aria-label={`Tier distribution: ${distribution.map((t) => `${t.name} ${t.count}`).join(', ')}`}
        className="space-y-2"
      >
        {distribution.map((tier) =>
        {
          const widthPercent = maxCount > 0 ? (tier.count / maxCount) * 100 : 0

          return (
            <div key={tier.name} className="flex items-center gap-3">
              <span
                className="w-16 shrink-0 truncate text-right text-xs font-medium"
                style={{ color: tier.color }}
                title={tier.name}
              >
                {tier.name}
              </span>
              <div className="relative h-6 min-w-0 flex-1">
                <div
                  className="flex h-full items-center rounded-sm transition-all"
                  style={{
                    width: `${Math.max(widthPercent, tier.count > 0 ? 3 : 0)}%`,
                    backgroundColor: tier.color,
                  }}
                >
                  {tier.count > 0 && (
                    <span
                      className="px-2 text-xs font-semibold"
                      style={{ color: getTextColor(tier.color) }}
                    >
                      {tier.count}
                    </span>
                  )}
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-[var(--t-text-faint)]">
                {tier.percentage.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    )
  }
)
