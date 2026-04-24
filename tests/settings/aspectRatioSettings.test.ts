// tests/settings/aspectRatioSettings.test.ts
// aspect-ratio settings behavior for deferred auto preview & mismatch rows

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { groupMismatchedItems } from '~/features/workspace/boards/lib/aspectRatio'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from '~/features/workspace/settings/model/aspectRatioPromptSnapshot'
import { resolvePendingAutoAspectRatio } from '~/features/workspace/settings/model/useDeferredAspectRatioPicker'
import { MismatchRows } from '~/features/workspace/settings/ui/AspectRatioSection'
import * as imageUrlHook from '~/shared/hooks/useImageUrl'
import { makeBoardSnapshot, makeItem } from '../fixtures'

afterEach(() =>
{
  vi.restoreAllMocks()
})

describe('resolvePendingAutoAspectRatio', () =>
{
  it('uses the current auto-derived ratio instead of the stale manual ratio', () =>
  {
    const portraitA = asItemId('portrait-a')
    const portraitB = asItemId('portrait-b')
    const square = asItemId('square')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [portraitA]: makeItem({
          id: portraitA,
          imageRef: { hash: 'portrait-a' },
          aspectRatio: 2 / 3,
        }),
        [portraitB]: makeItem({
          id: portraitB,
          imageRef: { hash: 'portrait-b' },
          aspectRatio: 2 / 3,
        }),
        [square]: makeItem({
          id: square,
          imageRef: { hash: 'square' },
          aspectRatio: 1,
        }),
      },
    })

    expect(resolvePendingAutoAspectRatio(board, 1)).toBeCloseTo(2 / 3)
  })

  it('keeps the pending ratio when no item ratio can be derived', () =>
  {
    const fallback = 4 / 3

    expect(resolvePendingAutoAspectRatio(makeBoardSnapshot(), fallback)).toBe(
      fallback
    )
  })
})

describe('aspect ratio prompt snapshot', () =>
{
  it('limits prompt targets to the opening mismatch set', () =>
  {
    const wide = asItemId('wide')
    const tall = asItemId('tall')
    const square = asItemId('square')
    const importedLater = asItemId('imported-later')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [wide]: makeItem({
          id: wide,
          imageRef: { hash: 'wide' },
          aspectRatio: 16 / 9,
        }),
        [tall]: makeItem({
          id: tall,
          imageRef: { hash: 'tall' },
          aspectRatio: 2 / 3,
        }),
        [square]: makeItem({
          id: square,
          imageRef: { hash: 'square' },
          aspectRatio: 1,
        }),
      },
    })

    const snapshot = createAspectRatioPromptSnapshot(board)
    expect(snapshot.itemIds).toEqual([wide, tall])

    const liveBoard = makeBoardSnapshot({
      ...board,
      itemAspectRatio: 16 / 9,
      items: {
        ...board.items,
        [importedLater]: makeItem({
          id: importedLater,
          imageRef: { hash: 'imported-later' },
          aspectRatio: 2 / 3,
        }),
      },
    })

    expect(
      resolveAspectRatioPromptItems(snapshot, liveBoard).map((item) => item.id)
    ).toEqual([tall])
  })

  it('drops snapshot items that no longer exist before bulk actions run', () =>
  {
    const wide = asItemId('wide')
    const tall = asItemId('tall')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      items: {
        [wide]: makeItem({
          id: wide,
          imageRef: { hash: 'wide' },
          aspectRatio: 16 / 9,
        }),
        [tall]: makeItem({
          id: tall,
          imageRef: { hash: 'tall' },
          aspectRatio: 2 / 3,
        }),
      },
    })

    const snapshot = createAspectRatioPromptSnapshot(board)
    const liveBoard = makeBoardSnapshot({
      ...board,
      items: {
        [wide]: board.items[wide],
      },
    })

    expect(
      resolveAspectRatioPromptItems(snapshot, liveBoard).map((item) => item.id)
    ).toEqual([wide])
  })
})

describe('AspectRatioSection mismatch controls', () =>
{
  it('passes the caller tolerance through mismatch detection', () =>
  {
    const nearSquare = asItemId('near-square')
    const fartherSquare = asItemId('farther-square')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [nearSquare]: makeItem({
          id: nearSquare,
          label: 'Near square',
          imageRef: { hash: 'near-square' },
          aspectRatio: 1.01,
        }),
        [fartherSquare]: makeItem({
          id: fartherSquare,
          label: 'Farther square',
          imageRef: { hash: 'farther-square' },
          aspectRatio: 1.03,
        }),
      },
    })

    expect(groupMismatchedItems(board, 0.005)).toHaveLength(2)
    expect(groupMismatchedItems(board, 0.05)).toHaveLength(0)
  })

  it('keeps per-item fit controls for same-ratio mismatches', () =>
  {
    vi.spyOn(imageUrlHook, 'useImageUrl').mockReturnValue(null)

    const wideA = asItemId('wide-a')
    const wideB = asItemId('wide-b')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'cover',
      items: {
        [wideA]: makeItem({
          id: wideA,
          label: 'Wide A',
          imageRef: { hash: 'wide-a' },
          aspectRatio: 16 / 9,
          imageFit: 'cover',
        }),
        [wideB]: makeItem({
          id: wideB,
          label: 'Wide B',
          imageRef: { hash: 'wide-b' },
          aspectRatio: 16 / 9,
          imageFit: 'contain',
        }),
      },
    })

    const html = renderToStaticMarkup(
      createElement(MismatchRows, {
        groups: groupMismatchedItems(board),
        boardDefaultFit: board.defaultItemImageFit,
        onSetGroupFit: vi.fn(),
        onSetItemFit: vi.fn(),
      })
    )

    expect(html).toContain('aria-label="Set fit for 16:9 group"')
    expect(html).toContain('aria-label="Fit for Wide A"')
    expect(html).toContain('aria-label="Fit for Wide B"')
  })
})
