// src/features/embed/ui/EmbedView.tsx
// minimal read-only board renderer for iframe embeds

import { useEffect, useState } from 'react'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import {
  getInboundShareRecoveryCopy,
  resolveInboundShare,
} from '~/features/platform/share/inboundShare'
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
  // viewers don't get to pick — fall back to overlay so unconfigured boards
  // render the same way they did before this preference existed
  defaultLabelPlacementMode: 'overlay',
  defaultLabelFontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
  itemShape: 'square',
  compactMode: false,
  labelWidth: 'default',
  paletteId: EMBED_DEFAULT_PALETTE_ID,
  textStyleId: 'default',
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'medium',
}

type EmbedLoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: BoardSnapshot }
  | { status: 'message'; title: string; body: string }

export const EmbedView = () =>
{
  const [state, setState] = useState<EmbedLoadState>({ status: 'loading' })

  useEffect(() =>
  {
    const controller = new AbortController()

    void resolveInboundShare({ signal: controller.signal })
      .then((result) =>
      {
        if (controller.signal.aborted) return
        if (result.kind === 'resolved')
        {
          setState({
            status: 'ready',
            data: normalizeBoardSnapshot(result.data, EMBED_DEFAULT_PALETTE_ID),
          })
          return
        }

        const copy = getInboundShareRecoveryCopy(result)
        setState({ status: 'message', title: copy.title, body: copy.body })
      })
      .catch(() =>
      {
        if (controller.signal.aborted) return
        setState({
          status: 'message',
          title: 'Embed could not load',
          body: 'The embedded board could not be loaded. Refresh the page or ask for a fresh embed URL.',
        })
      })

    return () => controller.abort()
  }, [])

  if (state.status === 'message')
  {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg-page)] p-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-base font-semibold text-[var(--t-text)]">
            {state.title}
          </h1>
          <p className="mt-2 text-sm text-[var(--t-text-muted)]">
            {state.body}
          </p>
          <a
            href={APP_PUBLIC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)]"
          >
            Open TierListBuilder
          </a>
        </div>
      </div>
    )
  }

  if (state.status === 'loading')
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
        {state.data.title && (
          <div className="px-4 pt-3 pb-2">
            <h1 className="text-base font-semibold text-[var(--t-text)]">
              {state.data.title}
            </h1>
          </div>
        )}

        <StaticBoard data={state.data} appearance={EMBED_APPEARANCE} />

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
