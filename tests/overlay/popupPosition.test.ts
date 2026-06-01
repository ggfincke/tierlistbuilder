// tests/overlay/popupPosition.test.ts
// anchored popup positioning

import { describe, expect, it } from 'vitest'
import {
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
  computeSettingsMenuStyle,
} from '~/shared/overlay/popupPosition'
import { makeRect } from '@tests/fixtures'

const anchorEl = <T extends HTMLElement>(rect: Partial<DOMRect>): T =>
  ({
    getBoundingClientRect: () => makeRect(rect),
  }) as T

describe('computeColorPickerStyle', () =>
{
  it('anchors the tray below the trigger & right-aligns it to the viewport', () =>
  {
    const button = anchorEl<HTMLButtonElement>({ bottom: 40, right: 300 })

    expect(
      computeColorPickerStyle(button, {
        width: 1200,
        height: 800,
      })
    ).toEqual({
      position: 'fixed',
      top: 48,
      right: 900,
    })
  })
})

describe('computeCustomColorPickerStyle', () =>
{
  it('clamps the popup inside the viewport when the anchor is near the edge', () =>
  {
    const button = anchorEl<HTMLButtonElement>({ bottom: 620, left: 980 })

    expect(
      computeCustomColorPickerStyle(button, null, 280, 200, {
        width: 1000,
        height: 700,
      })
    ).toEqual({
      position: 'fixed',
      top: 492,
      left: 712,
    })
  })
})

describe('computeSettingsMenuStyle', () =>
{
  it('opens below the trigger when there is enough room', () =>
  {
    const button = anchorEl<HTMLButtonElement>({
      top: 100,
      bottom: 160,
      right: 400,
    })

    expect(
      computeSettingsMenuStyle(button, {
        width: 1200,
        height: 900,
      })
    ).toEqual({
      position: 'fixed',
      top: 168,
      right: 800,
    })
  })

  it('flips above the trigger when the viewport is too short', () =>
  {
    const button = anchorEl<HTMLButtonElement>({
      top: 450,
      bottom: 700,
      right: 400,
    })

    expect(
      computeSettingsMenuStyle(button, {
        width: 1200,
        height: 800,
      })
    ).toEqual({
      position: 'fixed',
      bottom: 358,
      right: 800,
    })
  })
})
