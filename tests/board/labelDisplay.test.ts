// tests/board/labelDisplay.test.ts
// label display resolution edge cases

import { describe, expect, it } from 'vitest'
import { resolveLabelLayout } from '~/shared/board-ui/labelDisplay'

describe('resolveLabelLayout', () =>
{
  it('lets per-item fontSizePx override board fontSizePx', () =>
  {
    const layout = resolveLabelLayout({
      itemOptions: { fontSizePx: 16 },
      boardSettings: { fontSizePx: 9 },
      globalShowLabels: true,
    })

    expect(layout.fontSizePx).toBe(16)
  })

  it('lets per-item Auto text color override a colored board default', () =>
  {
    const layout = resolveLabelLayout({
      itemOptions: { textColor: 'auto' },
      boardSettings: { textColor: 'blue' },
      globalShowLabels: true,
    })

    expect(layout.textColor).toBe('auto')
  })
})
