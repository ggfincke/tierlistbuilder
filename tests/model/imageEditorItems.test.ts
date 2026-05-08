// tests/model/imageEditorItems.test.ts
// image editor item ordering, filtering, & pending-edit overlays

import { describe, expect, it } from 'vitest'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  applyPendingImageEditorEdit,
  collectImageEditorItems,
  filterImageEditorItems,
} from '~/features/workspace/imageEditor/model/useImageEditorItems'
import { makeItem, makeTier } from '../fixtures'

const imageItem = (id: string, overrides = {}) =>
  makeItem({
    id: asItemId(id),
    imageRef: { hash: `hash-${id}` },
    ...overrides,
  })

describe('image editor items', () =>
{
  it('collects image items in board order and skips duplicates or text items', () =>
  {
    const itemA = imageItem('item-a')
    const itemB = imageItem('item-b')
    const itemC = imageItem('item-c')
    const textItem = makeItem({ id: asItemId('item-text'), label: 'Text' })

    const result = collectImageEditorItems({
      items: {
        [itemA.id]: itemA,
        [itemB.id]: itemB,
        [itemC.id]: itemC,
        [textItem.id]: textItem,
      },
      tiers: [
        makeTier({ itemIds: [itemA.id, textItem.id] }),
        makeTier({ id: 'tier-a', itemIds: [itemB.id, itemA.id] }),
      ],
      unrankedItemIds: [itemC.id, itemB.id],
    })

    expect(result.map((item) => item.id)).toEqual([
      itemA.id,
      itemB.id,
      itemC.id,
    ])
  })

  it('filters mismatched and manually adjusted image items', () =>
  {
    const square = imageItem('item-square', { aspectRatio: 1 })
    const wide = imageItem('item-wide', { aspectRatio: 16 / 9 })
    const adjusted = imageItem('item-adjusted', {
      aspectRatio: 1,
      transform: { rotation: 0, zoom: 1.5, offsetX: 0, offsetY: 0 },
    })

    expect(
      filterImageEditorItems([square, wide, adjusted], 'mismatched', 1).map(
        (item) => item.id
      )
    ).toEqual([wide.id])

    expect(
      filterImageEditorItems([square, wide, adjusted], 'adjusted', 1).map(
        (item) => item.id
      )
    ).toEqual([adjusted.id])

    const allItems = [square, wide, adjusted]
    expect(filterImageEditorItems(allItems, 'all', 1)).toBe(allItems)
  })

  it('overlays a pending pane transform without mutating other items', () =>
  {
    const itemA = imageItem('item-a')
    const itemB = imageItem('item-b')
    const transform = { rotation: 0 as const, zoom: 2, offsetX: 0, offsetY: 0 }

    const result = applyPendingImageEditorEdit([itemA, itemB], {
      id: itemB.id,
      transform,
    })

    expect(result[0]).toBe(itemA)
    expect(result[1]).toEqual({ ...itemB, transform })
    expect(itemB.transform).toBeUndefined()
  })
})
