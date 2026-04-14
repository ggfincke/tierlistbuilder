// src/features/workspace/sharing/ui/EmbedView.tsx
// minimal read-only board renderer for iframe embeds

import { useEffect, useState } from 'react'

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'
import { normalizeBoardSnapshot } from '@/features/workspace/boards/model/boardSnapshot'
import {
  decodeBoardFromShareFragment,
  getShareFragment,
} from '@/features/workspace/sharing/lib/hashShare'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '@/shared/board-ui/constants'
import { ItemContent } from '@/shared/board-ui/ItemContent'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '@/shared/board-ui/BoardPrimitives'

// load embed data from the URL share fragment
const loadEmbedData = async (): Promise<BoardSnapshot | null> =>
{
  const fragment = getShareFragment()
  if (!fragment) return null

  try
  {
    return await decodeBoardFromShareFragment(fragment)
  }
  catch
  {
    return null
  }
}

export const EmbedView = () =>
{
  const [data, setData] = useState<BoardSnapshot | null>(null)
  const [error, setError] = useState(false)

  useEffect(() =>
  {
    void loadEmbedData().then((result) =>
    {
      if (result)
      {
        setData(normalizeBoardSnapshot(result, 'classic'))
      }
      else
      {
        setError(true)
      }
    })
  }, [])

  if (error)
  {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg-page)] p-4">
        <p className="text-sm text-[var(--t-text-muted)]">
          Could not load embedded tier list.
        </p>
      </div>
    )
  }

  if (!data)
  {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg-page)]">
        <p className="text-sm text-[var(--t-text-muted)]">Loading…</p>
      </div>
    )
  }

  const sizePx = ITEM_SIZE_PX.medium
  const paletteId = 'classic' as const

  return (
    <div className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text-secondary)]">
      <div className="mx-auto max-w-5xl">
        {data.title && (
          <div className="px-4 pt-3 pb-2">
            <h1 className="text-base font-semibold text-[var(--t-text)]">
              {data.title}
            </h1>
          </div>
        )}

        <div>
          {data.tiers.map((tier, index) => (
            <BoardRowSurface key={tier.id}>
              <BoardRowContent index={index}>
                <BoardLabelCellFrame
                  color={resolveTierColorSpec(paletteId, tier.colorSpec)}
                  itemSize="medium"
                  labelWidth="default"
                  tierLabelBold={false}
                  tierLabelItalic={false}
                  tierLabelFontSize="medium"
                >
                  <div className="flex flex-col items-center">
                    <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                      {tier.name}
                    </span>
                    <TierDescriptionSubtitle description={tier.description} />
                  </div>
                </BoardLabelCellFrame>

                <BoardItemsGrid compactMode={false} minHeightPx={sizePx}>
                  {tier.itemIds.map((itemId) =>
                  {
                    const item = data.items[itemId]
                    if (!item) return null

                    return (
                      <div
                        key={itemId}
                        style={{ width: sizePx, height: sizePx }}
                        className={`relative overflow-hidden ${SHAPE_CLASS.square}`}
                      >
                        <ItemContent item={item} showLabel={!!item.label} />
                      </div>
                    )
                  })}
                </BoardItemsGrid>
              </BoardRowContent>
            </BoardRowSurface>
          ))}
        </div>

        <div className="px-4 py-2 text-right">
          <a
            href="https://tierlistbuilder.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--t-text-dim)] transition-colors hover:text-[var(--t-text-secondary)]"
          >
            Made with Tier List Builder
          </a>
        </div>
      </div>
    </div>
  )
}
