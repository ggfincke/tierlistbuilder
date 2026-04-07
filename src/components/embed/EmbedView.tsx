// src/components/embed/EmbedView.tsx
// minimal read-only board renderer for iframe embeds

import { useEffect, useState } from 'react'

import type { TierListData } from '../../types'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { normalizeTierListData } from '../../domain/boardData'
import {
  decodeBoardFromShareFragment,
  getShareFragment,
} from '../../utils/shareLink'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '../../utils/constants'
import { ItemContent } from '../board/ItemContent'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '../board/BoardPrimitives'

// load embed data from the URL share fragment
const loadEmbedData = async (): Promise<TierListData | null> =>
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
  const [data, setData] = useState<TierListData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() =>
  {
    void loadEmbedData().then((result) =>
    {
      if (result)
      {
        setData(normalizeTierListData(result, 'classic'))
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
      <div className="flex min-h-screen items-center justify-center bg-[#1a1a2e] p-4">
        <p className="text-sm text-gray-400">
          Could not load embedded tier list.
        </p>
      </div>
    )
  }

  if (!data)
  {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1a1a2e]">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  const sizePx = ITEM_SIZE_PX.medium
  const paletteId = 'classic' as const

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-gray-200">
      <div className="mx-auto max-w-5xl">
        {data.title && (
          <div className="px-4 pt-3 pb-2">
            <h1 className="text-base font-semibold text-gray-100">
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
            className="text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            Made with Tier List Builder
          </a>
        </div>
      </div>
    </div>
  )
}
