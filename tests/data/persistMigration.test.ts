import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import { migrateSettingsState } from '~/features/workspace/settings/model/settingsStorageMigration'
import { migrateTierPresetState } from '~/features/workspace/tier-presets/model/tierPresetStorageMigration'

const DEFAULT_SETTINGS: AppSettings = {
  itemSize: 'medium',
  showLabels: false,
  itemShape: 'square',
  compactMode: false,
  exportBackgroundOverride: null,
  boardBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: 'classic',
  paletteId: 'classic',
  textStyleId: 'default',
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
  boardLocked: false,
  reducedMotion: false,
  preHighContrastThemeId: null,
  preHighContrastPaletteId: null,
  toolbarPosition: 'top',
  showAltTextButton: false,
}

describe('migrateSettingsState', () =>
{
  it('keeps valid persisted values & fills missing fields from defaults', () =>
  {
    const result = migrateSettingsState(
      {
        itemSize: 'large',
        showLabels: true,
        themeId: 'forest',
        paletteId: 'midnight',
        textStyleId: 'mono',
      },
      DEFAULT_SETTINGS
    )

    expect(result.itemSize).toBe('large')
    expect(result.showLabels).toBe(true)
    expect(result.themeId).toBe('forest')
    expect(result.paletteId).toBe('midnight')
    expect(result.textStyleId).toBe('mono')
    expect(result.toolbarPosition).toBe('top')
  })

  it('drops invalid persisted values back to defaults', () =>
  {
    const result = migrateSettingsState(
      {
        itemSize: 'huge',
        showLabels: 'yes',
        themeId: 'unknown',
        paletteId: 'unknown',
        toolbarPosition: 'center',
        showAltTextButton: 1,
      },
      DEFAULT_SETTINGS
    )

    expect(result.itemSize).toBe(DEFAULT_SETTINGS.itemSize)
    expect(result.showLabels).toBe(DEFAULT_SETTINGS.showLabels)
    expect(result.themeId).toBe(DEFAULT_SETTINGS.themeId)
    expect(result.paletteId).toBe(DEFAULT_SETTINGS.paletteId)
    expect(result.toolbarPosition).toBe(DEFAULT_SETTINGS.toolbarPosition)
    expect(result.showAltTextButton).toBe(DEFAULT_SETTINGS.showAltTextButton)
  })
})

describe('migrateTierPresetState', () =>
{
  it('normalizes persisted user presets', () =>
  {
    const result = migrateTierPresetState({
      userPresets: [
        {
          id: 'preset-1',
          name: 'Starter',
          builtIn: false,
          tiers: [
            {
              name: 'S',
              colorSpec: { kind: 'palette', index: 0 },
            },
          ],
        },
      ],
    })

    expect(result.userPresets).toHaveLength(1)
    expect(result.userPresets[0].id).toBe('preset-1')
    expect(result.userPresets[0].tiers[0].name).toBe('S')
  })

  it('filters invalid presets & repairs malformed tiers', () =>
  {
    const result = migrateTierPresetState({
      userPresets: [
        { name: 'Missing id' },
        {
          id: 'preset-2',
          name: '',
          tiers: [{ colorSpec: { kind: 'nope' } }, null],
        },
      ],
    })

    expect(result.userPresets).toHaveLength(1)
    expect(result.userPresets[0].name).toBe('Untitled Preset')
    expect(result.userPresets[0].tiers).toHaveLength(1)
    expect(result.userPresets[0].tiers[0].name).toBe('Tier 1')
    expect(result.userPresets[0].tiers[0].colorSpec).toEqual({
      kind: 'palette',
      index: 0,
    })
  })
})
