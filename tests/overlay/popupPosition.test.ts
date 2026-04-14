import { describe, expect, it } from 'vitest'
import {
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
  computeItemEditPopoverStyle,
  computeSettingsMenuStyle,
} from '@/shared/overlay/popupPosition'

const makeRect = (
  overrides: Partial<DOMRect> = {}
): Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'> =>
  ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    ...overrides,
  }) as Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>

describe('computeColorPickerStyle', () =>
{
  it('anchors the tray below the trigger & right-aligns it to the viewport', () =>
  {
    const button = {
      getBoundingClientRect: () => makeRect({ bottom: 40, right: 300 }),
    } as HTMLButtonElement

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
  it('uses the tray rect as the anchor when available', () =>
  {
    const button = {
      getBoundingClientRect: () => makeRect({ bottom: 48, left: 60 }),
    } as HTMLButtonElement
    const tray = {
      getBoundingClientRect: () => makeRect({ bottom: 160, left: 320 }),
    } as HTMLDivElement

    expect(
      computeCustomColorPickerStyle(button, tray, 280, 0, {
        width: 1200,
        height: 800,
      })
    ).toEqual({
      position: 'fixed',
      top: 168,
      left: 320,
    })
  })

  it('clamps the popup inside the viewport when the anchor is near the edge', () =>
  {
    const button = {
      getBoundingClientRect: () => makeRect({ bottom: 620, left: 980 }),
    } as HTMLButtonElement

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
    const button = {
      getBoundingClientRect: () =>
        makeRect({
          top: 100,
          bottom: 160,
          right: 400,
        }),
    } as HTMLButtonElement

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
    const button = {
      getBoundingClientRect: () =>
        makeRect({
          top: 450,
          bottom: 700,
          right: 400,
        }),
    } as HTMLButtonElement

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

describe('computeItemEditPopoverStyle', () =>
{
  it('positions the popover below the anchor & clamps it within the viewport', () =>
  {
    expect(
      computeItemEditPopoverStyle(
        makeRect({
          bottom: 640,
          left: 980,
        }),
        224,
        140,
        {
          width: 1000,
          height: 700,
        }
      )
    ).toEqual({
      position: 'fixed',
      top: 552,
      left: 768,
    })
  })
})
