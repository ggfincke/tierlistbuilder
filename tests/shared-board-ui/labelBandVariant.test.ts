// tests/shared-board-ui/labelBandVariant.test.ts
// label-band variant resolution for label-aware auto-crop.

import { describe, expect, it } from 'vitest'

import {
  placementFromMode,
  type BoardLabelSettings,
  type GlobalLabelDefaults,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  getItemLabelBandVariant,
  labelBandVariantKey,
} from '~/shared/board-ui/labelBandVariant'

const globalLabelDefaults: GlobalLabelDefaults = {
  showLabels: true,
  placementMode: 'captionBelow',
  fontSizePx: 12,
}

describe('label-band variants', () =>
{
  it('uses the resolved global caption band when an item has no overrides', () =>
  {
    expect(
      getItemLabelBandVariant({
        item: { label: 'Mario' },
        boardLabels: undefined,
        globalLabelDefaults,
      })
    ).toEqual({
      placement: 'captionBelow',
      fontSizePx: 12,
      textStyleId: undefined,
    })
  })

  it('includes item font, placement, and text style overrides in the key', () =>
  {
    const variant = getItemLabelBandVariant({
      item: {
        label: 'Mario',
        labelOptions: {
          placement: placementFromMode('captionAbove'),
          fontSizePx: 16,
          textStyleId: 'serif',
        },
      },
      boardLabels: {
        fontSizePx: 10,
        placement: placementFromMode('captionBelow'),
        show: true,
      },
      globalLabelDefaults,
    })

    expect(variant).toEqual({
      placement: 'captionAbove',
      fontSizePx: 16,
      textStyleId: 'serif',
    })
    expect(variant && labelBandVariantKey(variant)).toBe(
      'captionAbove:16:serif'
    )
  })

  it('returns null when the live tile has no caption band', () =>
  {
    const hiddenBoardLabels: BoardLabelSettings = { show: false }
    expect(
      getItemLabelBandVariant({
        item: { label: 'Mario' },
        boardLabels: hiddenBoardLabels,
        globalLabelDefaults,
      })
    ).toBeNull()
    expect(
      getItemLabelBandVariant({
        item: {
          label: 'Mario',
          labelOptions: { placement: { mode: 'overlay', x: 0.5, y: 0.95 } },
        },
        boardLabels: undefined,
        globalLabelDefaults,
      })
    ).toBeNull()
    expect(
      getItemLabelBandVariant({
        item: { label: '' },
        boardLabels: undefined,
        globalLabelDefaults,
      })
    ).toBeNull()
  })
})
