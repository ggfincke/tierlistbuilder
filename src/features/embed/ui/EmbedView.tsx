// src/features/embed/ui/EmbedView.tsx
// minimal read-only board renderer for iframe embeds

import { useEffect, useState } from 'react'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import { resolveInboundShare } from '~/features/workspace/sharing/inbound/inboundShare'
import {
  StaticBoard,
  type StaticBoardAppearance,
} from '~/shared/board-ui/StaticBoard'
import { APP_PUBLIC_URL } from '~/shared/lib/urls'

// palette used to colorize embedded boards. `classic` is the app's neutral
// baseline; embed consumers don't get palette choice today
const EMBED_DEFAULT_PALETTE_ID: PaletteId = 'classic'

const EMBED_APPEARANCE: StaticBoardAppearance = {
  itemSize: 'medium',
  showLabels: true,
  itemShape: 'square',
  compactMode: false,
  labelWidth: 'default',
  paletteId: EMBED_DEFAULT_PALETTE_ID,
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'medium',
}

// load embed data from the current share fragment
const loadEmbedData = async (
  signal: AbortSignal
): Promise<BoardSnapshot | null> =>
{
  const result = await resolveInboundShare({ signal })
  return result.kind === 'resolved' ? result.data : null
}

export const EmbedView = () =>
{
  const [data, setData] = useState<BoardSnapshot | null>(null)
  const [error, setError] = useState(false)

  useEffect(() =>
  {
    const controller = new AbortController()

    void loadEmbedData(controller.signal)
      .then((result) =>
      {
        if (controller.signal.aborted) return
        if (result)
        {
          setData(normalizeBoardSnapshot(result, EMBED_DEFAULT_PALETTE_ID))
        }
        else
        {
          setError(true)
        }
      })
      .catch(() =>
      {
        if (controller.signal.aborted) return
        setError(true)
      })

    return () => controller.abort()
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

        <StaticBoard data={data} appearance={EMBED_APPEARANCE} />

        <div className="px-4 py-2 text-right">
          <a
            href={APP_PUBLIC_URL}
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
