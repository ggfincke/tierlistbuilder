// tests/shared-board-ui/labelBandVariant.test.ts
// label-band variant resolution for label-aware auto-crop.

import { describe, expect, it } from 'vitest'

import {
  placementFromMode,
  type GlobalLabelDefaults,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  getItemLabelBandVariant,
  labelBandVariantKey,
} from '~/shared/board-ui/labels/labelBandVariant'

const globalLabelDefaults: GlobalLabelDefaults = {
  showLabels: true,
  placementMode: 'captionBelow',
  fontSizePx: 12,
}

describe('label-band variants', () =>
{
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
})
