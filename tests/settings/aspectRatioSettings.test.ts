// tests/settings/aspectRatioSettings.test.ts
// pure helpers backing the aspect-ratio prompt & mismatch detection

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  formatAspectRatio,
  formatPreciseAspectRatio,
  groupMismatchedItems,
  computeAutoBoardAspectRatio,
  getBoardItemAspectRatio,
} from '~/shared/board-ui/aspectRatio'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from '~/features/workspace/board-settings/model/aspect-ratio/aspectRatioPromptSnapshot'
import { shouldOpenAspectRatioPromptAfterImport } from '~/features/workspace/board-settings/model/aspect-ratio/aspectRatioPromptImport'
import { makeBoardSnapshot, makeItem } from '@tests/fixtures'

describe('aspect ratio prompt snapshot', () =>
{
  it('tracks current mismatches while preserving the opening cleanup set', () =>
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

    const { current, cleanup } = resolveAspectRatioPromptItems(
      snapshot,
      liveBoard
    )
    expect(current.map((item) => item.id)).toEqual([
      tall,
      square,
      importedLater,
    ])
    expect(cleanup.map((item) => item.id)).toEqual([
      wide,
      tall,
      square,
      importedLater,
    ])
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

    const { current, cleanup } = resolveAspectRatioPromptItems(
      snapshot,
      liveBoard
    )
    expect(current.map((item) => item.id)).toEqual([wide])
    expect(cleanup.map((item) => item.id)).toEqual([wide])
  })

  it('keeps opening targets for cleanup after the picked ratio matches them', () =>
  {
    const poster = asItemId('poster')

    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [poster]: makeItem({
          id: poster,
          imageRef: { hash: 'poster' },
          aspectRatio: 2 / 3,
          transform: {
            rotation: 0,
            zoom: 1.4,
            offsetX: 0,
            offsetY: 0,
          },
        }),
      },
    })

    const snapshot = createAspectRatioPromptSnapshot(board)
    const liveBoard = makeBoardSnapshot({
      ...board,
      itemAspectRatio: 2 / 3,
    })

    const { current, cleanup } = resolveAspectRatioPromptItems(
      snapshot,
      liveBoard
    )
    expect(current).toEqual([])
    expect(cleanup.map((item) => item.id)).toEqual([poster])
  })

  it('adds newly mismatched items to cleanup after the picked ratio changes', () =>
  {
    const poster = asItemId('poster')
    const square = asItemId('square')

    const board = makeBoardSnapshot({
      itemAspectRatio: 2 / 3,
      itemAspectRatioMode: 'manual',
      items: {
        [poster]: makeItem({
          id: poster,
          imageRef: { hash: 'poster' },
          aspectRatio: 2 / 3,
        }),
        [square]: makeItem({
          id: square,
          imageRef: { hash: 'square' },
          aspectRatio: 1,
          transform: {
            rotation: 0,
            zoom: 0.7,
            offsetX: 0,
            offsetY: 0,
          },
        }),
      },
    })

    const snapshot = createAspectRatioPromptSnapshot(board)
    const liveBoard = makeBoardSnapshot({
      ...board,
      itemAspectRatio: 1,
    })

    const { current, cleanup } = resolveAspectRatioPromptItems(
      snapshot,
      liveBoard
    )
    expect(current.map((item) => item.id)).toEqual([poster])
    expect(cleanup.map((item) => item.id)).toEqual([square, poster])
  })
})

describe('shouldOpenAspectRatioPromptAfterImport', () =>
{
  it('opens when an import increases mismatches unless dismissed', () =>
  {
    const existing = asItemId('existing')
    const imported = asItemId('imported')
    const matchingImported = asItemId('matching-imported')

    const before = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [existing]: makeItem({
          id: existing,
          imageRef: { hash: 'existing' },
          aspectRatio: 2 / 3,
        }),
      },
    })
    const after = makeBoardSnapshot({
      ...before,
      items: {
        ...before.items,
        [imported]: makeItem({
          id: imported,
          imageRef: { hash: 'imported' },
          aspectRatio: 2 / 3,
        }),
      },
    })

    expect(shouldOpenAspectRatioPromptAfterImport(before, after)).toBe(true)
    expect(
      shouldOpenAspectRatioPromptAfterImport(before, {
        ...before,
        items: {
          ...before.items,
          [matchingImported]: makeItem({
            id: matchingImported,
            imageRef: { hash: 'matching-imported' },
            aspectRatio: 1,
          }),
        },
      })
    ).toBe(false)
    expect(
      shouldOpenAspectRatioPromptAfterImport(before, {
        ...after,
        aspectRatioPromptDismissed: true,
      })
    ).toBe(false)
    expect(shouldOpenAspectRatioPromptAfterImport(before, before)).toBe(false)
  })
})

describe('groupMismatchedItems', () =>
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
})

describe('board slot aspect ratio bounds', () =>
{
  it('clamps extreme board ratios while preserving natural item ratios', () =>
  {
    const panoramic = asItemId('panoramic')
    const tall = asItemId('tall')

    const wideBoard = makeBoardSnapshot({
      itemAspectRatio: 100,
      items: {
        [panoramic]: makeItem({
          id: panoramic,
          imageRef: { hash: 'panoramic' },
          aspectRatio: 100,
        }),
      },
    })
    const tallBoard = makeBoardSnapshot({
      itemAspectRatio: 0.01,
      items: {
        [tall]: makeItem({
          id: tall,
          imageRef: { hash: 'tall' },
          aspectRatio: 0.01,
        }),
      },
    })

    expect(getBoardItemAspectRatio(wideBoard)).toBe(4)
    expect(getBoardItemAspectRatio(tallBoard)).toBe(0.25)
    expect(computeAutoBoardAspectRatio(wideBoard)).toBe(4)
    expect(itemSlotDimensions('medium', 100)).toEqual({
      width: 208,
      height: 52,
    })
    expect(itemSlotDimensions('medium', 0.01)).toEqual({
      width: 52,
      height: 208,
    })
    expect(wideBoard.items[panoramic].aspectRatio).toBe(100)
  })
})

describe('formatPreciseAspectRatio', () =>
{
  it('keeps near-square auto ratios distinct from display-rounded labels', () =>
  {
    expect(formatAspectRatio(1.01)).toBe('1:1')
    expect(formatPreciseAspectRatio(1.01)).toBe('1.01:1')
  })

  it('still prefers exact small-denominator ratios', () =>
  {
    expect(formatPreciseAspectRatio(8 / 9)).toBe('8:9')
  })
})
