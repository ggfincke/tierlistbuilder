// tests/model/imageEditorModalActions.test.ts
// image-editor modal: adjusted-item count & label apply-to-all plan

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  buildBoardLabelSettingsFromSource,
  countAdjustedImageEditorItems,
  countLabelOverridesAffected,
  createApplyLabelToAllPlan,
} from '~/features/workspace/imageEditor/model/imageEditorModalPlans'
import { collectLabelOptionClearEntries } from '~/shared/board-ui/labelOverrides'
import { makeItem } from '../fixtures'

const defaultGlobalLabels = {
  showLabels: true,
  placementMode: 'overlay',
} as const

const adjustedTransform: ItemTransform = {
  rotation: 0,
  zoom: 1.5,
  offsetX: 0,
  offsetY: 0,
}

const imageItem = (id: string, overrides = {}) =>
  makeItem({
    id: asItemId(id),
    imageRef: { hash: `hash-${id}` },
    ...overrides,
  })

describe('image editor modal actions', () =>
{
  it('counts adjusted items, layering pending pane edits over committed transforms', () =>
  {
    const adjusted = imageItem('item-adjusted', {
      transform: adjustedTransform,
    })
    const plain = imageItem('item-plain')

    expect(countAdjustedImageEditorItems([adjusted, plain], null)).toBe(1)
    expect(
      countAdjustedImageEditorItems([adjusted, plain], {
        id: adjusted.id,
        transform: null,
      })
    ).toBe(0)
    expect(
      countAdjustedImageEditorItems([adjusted, plain], {
        id: plain.id,
        transform: adjustedTransform,
      })
    ).toBe(2)
  })

  it('builds board label defaults from source while omitting auto text color', () =>
  {
    const source = imageItem('source', {
      labelOptions: {
        visible: false,
        placement: { mode: 'captionAbove' },
        scrim: 'light',
        fontSizePx: 18,
        textStyleId: 'serif',
        textColor: 'blue',
      },
    })

    expect(
      buildBoardLabelSettingsFromSource({
        source,
        boardLabels: { show: true, fontSizePx: 11 },
        globalLabelDefaults: defaultGlobalLabels,
      })
    ).toEqual({
      show: false,
      placement: { mode: 'captionAbove' },
      scrim: 'light',
      fontSizePx: 18,
      textStyleId: 'serif',
      textColor: 'blue',
    })

    const auto = imageItem('source-auto', {
      labelOptions: { visible: true, textColor: 'auto' },
    })
    expect(
      buildBoardLabelSettingsFromSource({
        source: auto,
        boardLabels: { textColor: 'purple' },
        globalLabelDefaults: { showLabels: false, placementMode: 'overlay' },
      })
    ).not.toHaveProperty('textColor')
  })

  it('plans apply-to-all by copying defaults, clearing overrides, & ignoring source in count', () =>
  {
    const source = imageItem('source', {
      labelOptions: { placement: { mode: 'captionBelow' } },
    })
    const other = imageItem('other', { labelOptions: { fontSizePx: 20 } })
    const plain = imageItem('plain')
    const items = {
      [source.id]: source,
      [other.id]: other,
      [plain.id]: plain,
    }

    expect(
      countLabelOverridesAffected(source.id, items, [source, other, plain])
    ).toBe(1)

    expect(collectLabelOptionClearEntries([source, other, plain])).toEqual([
      { id: source.id, options: null },
      { id: other.id, options: null },
    ])

    expect(
      createApplyLabelToAllPlan({
        sourceId: source.id,
        items,
        allImageItems: [source, other, plain],
        boardLabels: { scrim: 'dark', fontSizePx: 12 },
        globalLabelDefaults: defaultGlobalLabels,
      })
    ).toEqual({
      settings: {
        show: true,
        placement: { mode: 'captionBelow' },
        scrim: 'dark',
        fontSizePx: 12,
        textStyleId: undefined,
      },
      clearEntries: [
        { id: source.id, options: null },
        { id: other.id, options: null },
      ],
    })
  })
})
