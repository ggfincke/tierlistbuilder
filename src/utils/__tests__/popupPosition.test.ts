// src/utils/__tests__/popupPosition.test.ts
// unit tests for fixed-popup placement & viewport clamping

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
  computeSettingsMenuStyle,
} from '../popupPosition'

const makeButton = (rect: Partial<DOMRect>): HTMLButtonElement =>
  ({
    getBoundingClientRect: vi.fn(() => ({
      top: 0,
      bottom: 40,
      left: 0,
      right: 80,
      width: 80,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    })),
  }) as unknown as HTMLButtonElement

const makeTray = (rect: Partial<DOMRect>): HTMLDivElement =>
  ({
    getBoundingClientRect: vi.fn(() => ({
      top: 0,
      bottom: 40,
      left: 0,
      right: 80,
      width: 80,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    })),
  }) as unknown as HTMLDivElement

describe('popup positioning', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 700,
    })
  })

  afterEach(() =>
  {
    vi.unstubAllGlobals()
  })

  it('right-aligns the color picker below its trigger button', () =>
  {
    expect(
      computeColorPickerStyle(
        makeButton({ top: 120, bottom: 160, left: 680, right: 760 })
      )
    ).toEqual({
      position: 'fixed',
      top: 168,
      right: 240,
    })
  })

  it('clamps the custom color picker within the viewport', () =>
  {
    expect(
      computeCustomColorPickerStyle(
        makeButton({ top: 540, bottom: 580, left: 880, right: 960 }),
        makeTray({ top: 560, bottom: 600, left: 860, right: 940 }),
        280,
        120
      )
    ).toEqual({
      position: 'fixed',
      top: 572,
      left: 712,
    })
  })

  it('places settings menus below when there is room & above when there is not', () =>
  {
    expect(
      computeSettingsMenuStyle(
        makeButton({ top: 120, bottom: 160, left: 680, right: 760 })
      )
    ).toEqual({
      position: 'fixed',
      top: 168,
      right: 240,
    })

    expect(
      computeSettingsMenuStyle(
        makeButton({ top: 620, bottom: 660, left: 680, right: 760 })
      )
    ).toEqual({
      position: 'fixed',
      bottom: 88,
      right: 240,
    })
  })
})
