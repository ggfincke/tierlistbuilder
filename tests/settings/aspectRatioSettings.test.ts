// tests/settings/aspectRatioSettings.test.ts
// aspect-ratio prompt snapshot & mismatch grouping

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  computeAutoBoardAspectRatio,
  groupMismatchedItems,
} from '~/shared/board-ui/aspectRatio'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from '~/features/workspace/settings/model/aspectRatioPromptSnapshot'
import { resolvePendingAutoAspectRatio } from '~/features/workspace/settings/model/useDeferredAspectRatioPicker'
import { makeBoardSnapshot, makeItem } from '../fixtures'

describe('aspect ratio resolution', () =>
{
  it('uses current item ratios over stale manual ratios & falls back when none', () =>
  {
    const portraitA = asItemId('portrait-a')
    const portraitB = asItemId('portrait-b')
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
      },
    })
    expect(resolvePendingAutoAspectRatio(board, 1)).toBeCloseTo(2 / 3)
    expect(resolvePendingAutoAspectRatio(makeBoardSnapshot(), 4 / 3)).toBe(
      4 / 3
    )
    expect(computeAutoBoardAspectRatio(board)).toBeCloseTo(2 / 3)
  })
})

describe('aspect ratio prompt snapshot', () =>
{
  it('limits prompt targets to opening mismatch set & drops removed items', () =>
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
      resolveAspectRatioPromptItems(snapshot, liveBoard).map((i) => i.id)
    ).toEqual([tall])

    const partial = makeBoardSnapshot({
      ...board,
      items: { [wide]: board.items[wide] },
    })
    expect(
      resolveAspectRatioPromptItems(snapshot, partial).map((i) => i.id)
    ).toEqual([wide])
  })
})

describe('groupMismatchedItems', () =>
{
  it('passes the caller tolerance through mismatch detection', () =>
  {
    const a = asItemId('a')
    const b = asItemId('b')
    const board = makeBoardSnapshot({
      itemAspectRatio: 1,
      itemAspectRatioMode: 'manual',
      items: {
        [a]: makeItem({
          id: a,
          imageRef: { hash: 'a' },
          aspectRatio: 1.01,
        }),
        [b]: makeItem({
          id: b,
          imageRef: { hash: 'b' },
          aspectRatio: 1.03,
        }),
      },
    })
    expect(groupMismatchedItems(board, 0.005)).toHaveLength(2)
    expect(groupMismatchedItems(board, 0.05)).toHaveLength(0)
  })
})
