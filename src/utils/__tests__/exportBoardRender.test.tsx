// src/utils/__tests__/exportBoardRender.test.tsx
// @vitest-environment jsdom
// unit tests for isolated export board rendering & appearance selection

import { afterEach, describe, expect, it } from 'vitest'

import type { AppSettings, TierListData } from '../../types'
import {
  createExportCaptureSession,
  getExportAppearance,
} from '../exportBoardRender'

const settings: AppSettings = {
  itemSize: 'medium',
  showLabels: true,
  itemShape: 'rounded',
  compactMode: false,
  exportBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: 'classic',
  textStyleId: 'default',
  syncTierColorsWithTheme: true,
  tierLabelBold: true,
  tierLabelItalic: false,
  tierLabelFontSize: 'medium',
}

const board: TierListData = {
  title: 'Export Me',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#ff0000',
      colorSource: { paletteType: 'default', index: 0 },
      itemIds: ['item-1'],
    },
  ],
  unrankedItemIds: [],
  items: {
    'item-1': {
      id: 'item-1',
      label: 'Alpha',
      backgroundColor: '#112233',
    },
  },
  deletedItems: [],
}

afterEach(() =>
{
  document.body.innerHTML = ''
})

describe('getExportAppearance', () =>
{
  it('selects only the export-relevant appearance fields', () =>
  {
    expect(getExportAppearance(settings)).toEqual({
      itemSize: 'medium',
      showLabels: true,
      itemShape: 'rounded',
      compactMode: false,
      labelWidth: 'default',
      tierLabelBold: true,
      tierLabelItalic: false,
      tierLabelFontSize: 'medium',
    })
  })
})

describe('createExportCaptureSession', () =>
{
  it('renders an isolated off-screen export board & cleans it up on destroy', async () =>
  {
    const session = createExportCaptureSession({
      appearance: getExportAppearance(settings),
      backgroundColor: '#000000',
    })

    const element = await session.renderBoard(board)

    expect(element.getAttribute('data-testid')).toBe('export-board-root')
    expect(document.body.textContent).toContain('S')
    expect(document.body.textContent).toContain('Alpha')

    session.destroy()

    expect(
      document.querySelector('[data-testid="export-board-root"]')
    ).toBeNull()
  })
})
