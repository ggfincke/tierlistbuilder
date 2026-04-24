// src/features/workspace/stats/ui/StatsModal.tsx
// board statistics modal — item distribution, summary cards, & tier chart

import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useId, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { computeBoardStats } from '~/features/workspace/stats/model/boardStats'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TierDistributionChart } from './TierDistributionChart'

interface StatsModalProps
{
  open: boolean
  onClose: () => void
}

interface StatCardProps
{
  label: string
  value: string | number
}

const StatCard = ({ label, value }: StatCardProps) => (
  <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-4 py-3 text-center">
    <div className="text-xl font-bold text-[var(--t-text)]">{value}</div>
    <div className="mt-0.5 text-xs text-[var(--t-text-muted)]">{label}</div>
  </div>
)

export const StatsModal = ({ open, onClose }: StatsModalProps) =>
{
  const titleId = useId()
  const paletteId = useCurrentPaletteId()

  const boardData = useActiveBoardStore(
    useShallow((state) => (open ? extractBoardData(state) : null))
  )
  const stats = useMemo(
    () => (boardData ? computeBoardStats(boardData, paletteId) : null),
    [boardData, paletteId]
  )

  if (!stats) return null

  const maxCount = Math.max(...stats.tierDistribution.map((t) => t.count), 1)

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-lg flex-col p-5"
    >
      <div className="mb-5 flex items-center justify-between">
        <ModalHeader titleId={titleId}>Board Statistics</ModalHeader>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Items" value={stats.totalItems} />
        <StatCard label="Ranked" value={stats.rankedItems} />
        <StatCard label="Unranked" value={stats.unrankedItems} />
      </div>

      {stats.totalItems > 0 && (
        <div className="mb-5">
          <h3 className="mb-3 text-sm font-medium text-[var(--t-text-secondary)]">
            Distribution
          </h3>
          <TierDistributionChart
            distribution={stats.tierDistribution}
            maxCount={maxCount}
          />
        </div>
      )}

      {stats.totalItems > 0 && (
        <div className="space-y-2 border-t border-[var(--t-border)] pt-4">
          {stats.averageTierRank !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--t-text-muted)]">
                Average Tier Position
              </span>
              <span className="font-medium text-[var(--t-text)]">
                {stats.averageTierRank.toFixed(1)}
              </span>
            </div>
          )}
          {stats.mostPopulatedTier && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--t-text-muted)]">Most Populated</span>
              <span className="font-medium text-[var(--t-text)]">
                {stats.mostPopulatedTier}
              </span>
            </div>
          )}
          {stats.leastPopulatedTier &&
            stats.leastPopulatedTier !== stats.mostPopulatedTier && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--t-text-muted)]">
                  Least Populated
                </span>
                <span className="font-medium text-[var(--t-text)]">
                  {stats.leastPopulatedTier}
                </span>
              </div>
            )}
          {stats.emptyTiers > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--t-text-muted)]">Empty Tiers</span>
              <span className="font-medium text-[var(--t-text)]">
                {stats.emptyTiers}
              </span>
            </div>
          )}
        </div>
      )}

      {stats.totalItems === 0 && (
        <p className="py-8 text-center text-sm text-[var(--t-text-muted)]">
          Add items to your board to see statistics.
        </p>
      )}
    </BaseModal>
  )
}
