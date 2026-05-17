// src/features/marketplace/components/consensus/item/usePopover.ts
// open/close state hook for the click-anchored item popover. split from the
// component file so fast-refresh can hot-reload the popover JSX cleanly

import { useCallback, useState } from 'react'

import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

export interface PopoverAnchorRect
{
  top: number
  bottom: number
  left: number
  width: number
}

interface PopoverState
{
  row: MarketplaceTemplateRankingAggregateItem
  anchorRect: PopoverAnchorRect
}

export const usePopover = () =>
{
  const [state, setState] = useState<PopoverState | null>(null)
  const open = useCallback(
    (row: MarketplaceTemplateRankingAggregateItem, target: Element): void =>
    {
      const rect = target.getBoundingClientRect()
      setState({
        row,
        anchorRect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
        },
      })
    },
    []
  )
  const close = useCallback(() => setState(null), [])
  return { state, open, close }
}
