// tests/shared-board-ui/labelDisplay.test.ts
// label display helper equivalence for tile renderers.

import { describe, expect, it } from 'vitest'

import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  resolveItemLabel,
  resolveLabelDisplay,
} from '~/shared/board-ui/labels/labelDisplay'

const globalLabelDefaults: GlobalLabelDefaults = {
  showLabels: true,
  placementMode: 'captionBelow',
  fontSizePx: 12,
}

describe('label display helpers', () =>
{
  it('resolves item labels through the same path as the expanded input', () =>
  {
    const item: Pick<TierItem, 'label' | 'labelOptions'> = {
      label: 'Mario',
      labelOptions: {
        fontSizePx: 16,
        textColor: 'white',
      },
    }
    const boardLabels: BoardLabelSettings = {
      show: true,
      scrim: 'light',
    }

    expect(resolveItemLabel(item, boardLabels, globalLabelDefaults)).toEqual(
      resolveLabelDisplay({
        itemLabel: item.label,
        itemOptions: item.labelOptions,
        boardSettings: boardLabels,
        globalLabelDefaults,
      })
    )
  })

  it('returns null for hidden or empty labels', () =>
  {
    expect(
      resolveItemLabel(
        { label: 'Mario', labelOptions: { visible: false } },
        undefined,
        globalLabelDefaults
      )
    ).toBeNull()
    expect(
      resolveItemLabel({ label: '  ', labelOptions: undefined }, undefined, {
        ...globalLabelDefaults,
        showLabels: true,
      })
    ).toBeNull()
  })
})
