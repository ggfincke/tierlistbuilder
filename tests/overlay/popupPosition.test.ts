// tests/overlay/popupPosition.test.ts
// fixed-popup placement, viewport clamping, & flip-above behavior

import { describe, expect, it } from 'vitest'
import {
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
  computeSettingsMenuStyle,
} from '~/shared/overlay/popupPosition'
import { makeRect } from '../fixtures'

describe('popup positioning', () =>
{
  it('anchors below trigger, falls back to tray rect, & clamps within the viewport', () =>
  {
    const colorButton = {
      getBoundingClientRect: () => makeRect({ bottom: 40, right: 300 }),
    } as HTMLButtonElement
    expect(
      computeColorPickerStyle(colorButton, { width: 1200, height: 800 })
    ).toEqual({ position: 'fixed', top: 48, right: 900 })

    const trayButton = {
      getBoundingClientRect: () => makeRect({ bottom: 48, left: 60 }),
    } as HTMLButtonElement
    const tray = {
      getBoundingClientRect: () => makeRect({ bottom: 160, left: 320 }),
    } as HTMLDivElement
    expect(
      computeCustomColorPickerStyle(trayButton, tray, 280, 0, {
        width: 1200,
        height: 800,
      })
    ).toEqual({ position: 'fixed', top: 168, left: 320 })

    const edgeButton = {
      getBoundingClientRect: () => makeRect({ bottom: 620, left: 980 }),
    } as HTMLButtonElement
    expect(
      computeCustomColorPickerStyle(edgeButton, null, 280, 200, {
        width: 1000,
        height: 700,
      })
    ).toEqual({ position: 'fixed', top: 492, left: 712 })
  })

  it('flips menus above when the viewport is too short below the trigger', () =>
  {
    const tallButton = {
      getBoundingClientRect: () =>
        makeRect({ top: 100, bottom: 160, right: 400 }),
    } as HTMLButtonElement
    expect(
      computeSettingsMenuStyle(tallButton, { width: 1200, height: 900 })
    ).toEqual({ position: 'fixed', top: 168, right: 800 })

    const flipButton = {
      getBoundingClientRect: () =>
        makeRect({ top: 450, bottom: 700, right: 400 }),
    } as HTMLButtonElement
    expect(
      computeSettingsMenuStyle(flipButton, { width: 1200, height: 800 })
    ).toEqual({ position: 'fixed', bottom: 358, right: 800 })
  })
})
