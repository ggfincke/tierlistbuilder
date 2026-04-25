// tests/dnd/dragDomCapture.test.ts
// rendered snapshot DOM capture behavior

import { describe, expect, it, vi } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { ALL_ITEM_ELEMENTS_SELECTOR } from '~/features/workspace/boards/lib/dndIds'
import { captureRenderedContainerSnapshot } from '~/features/workspace/boards/dnd/dragDomCapture'
import { tierContainerSelector } from '~/shared/board-ui/boardTestIds'
import { findTierById, makeContainerSnapshot, makeRect } from '../fixtures'

const makeRenderedItem = (
  itemId: string,
  left: number,
  top: number
): HTMLElement =>
  ({
    dataset: { itemId },
    getBoundingClientRect: () => makeRect({ left, top, width: 40, height: 40 }),
  }) as unknown as HTMLElement

const makeRenderedContainer = (...items: HTMLElement[]): Element =>
  ({
    querySelectorAll: vi.fn((selector: string) =>
      selector === ALL_ITEM_ELEMENTS_SELECTOR ? items : []
    ),
  }) as unknown as Element

describe('captureRenderedContainerSnapshot', () =>
{
  it('scopes DOM reads to the requested container', () =>
  {
    const targetSelector = tierContainerSelector('tier-a')
    const containers = new Map<string, Element>([
      [
        targetSelector,
        makeRenderedContainer(
          makeRenderedItem('item-4', 100, 0),
          makeRenderedItem('item-5', 0, 0)
        ),
      ],
    ])
    const querySelector = vi.fn(
      (selector: string) => containers.get(selector) ?? null
    )

    vi.stubGlobal('document', { querySelector })

    const result = captureRenderedContainerSnapshot(
      makeContainerSnapshot(),
      'tier-a'
    )

    expect(result).not.toBeNull()
    if (!result) throw new Error('expected rendered snapshot')
    expect(querySelector).toHaveBeenCalledTimes(1)
    expect(querySelector).toHaveBeenCalledWith(targetSelector)
    expect(findTierById(result.tiers, 'tier-s').itemIds).toEqual([
      asItemId('item-1'),
      asItemId('item-2'),
      asItemId('item-3'),
    ])
    expect(findTierById(result.tiers, 'tier-a').itemIds).toEqual([
      asItemId('item-5'),
      asItemId('item-4'),
    ])
  })
})
