// tests/convex/preferenceMutations.test.ts
// Convex preference mutation validation boundaries

import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  EXPORT_ITEMS_PER_ROW_DEFAULT,
  EXPORT_ITEMS_PER_ROW_MAX,
  EXPORT_ITEMS_PER_ROW_MIN,
  type AppPreferences,
} from '@tierlistbuilder/contracts/platform/preferences'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import {
  asUser,
  expectConvexCode,
  makeTest,
  seedUser,
} from './convexTestHelpers'

const makePreferences = (
  patch: Partial<AppPreferences> = {}
): AppPreferences => ({
  itemSize: 'medium',
  showLabels: false,
  defaultLabelPlacementMode: 'overlay',
  defaultLabelFontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
  itemShape: 'square',
  compactMode: false,
  exportBackgroundOverride: null,
  exportItemsPerRow: EXPORT_ITEMS_PER_ROW_DEFAULT,
  boardBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: 'scoreboard',
  paletteId: 'classic',
  textStyleId: 'default',
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
  boardLocked: false,
  topNavLocked: true,
  reducedMotion: false,
  toolbarPosition: 'top',
  showItemEditButton: true,
  autoCropTrimSoftShadows: true,
  ...patch,
})

describe('preference mutations', () =>
{
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['below the minimum', EXPORT_ITEMS_PER_ROW_MIN - 1],
    ['above the maximum', EXPORT_ITEMS_PER_ROW_MAX + 1],
  ])(
    'rejects exportItemsPerRow when it is %s',
    async (_, exportItemsPerRow) =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const caller = asUser(t, userId)

      await expectConvexCode(
        caller.mutation(
          api.platform.preferences.mutations.upsertMyPreferences,
          {
            preferences: makePreferences({ exportItemsPerRow }),
          }
        ),
        CONVEX_ERROR_CODES.invalidInput
      )
    }
  )

  it('persists and returns an in-range exportItemsPerRow', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const preferences = makePreferences({
      exportItemsPerRow: EXPORT_ITEMS_PER_ROW_MAX,
    })

    const result = await caller.mutation(
      api.platform.preferences.mutations.upsertMyPreferences,
      { preferences }
    )
    const read = await caller.query(
      api.platform.preferences.queries.getMyPreferences,
      {}
    )

    expect(result.updatedAt).toEqual(expect.any(Number))
    expect(read).toEqual({ preferences, updatedAt: result.updatedAt })
  })
})
