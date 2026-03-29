// src/utils/popupPosition.ts
// shared popup positioning utilities for fixed overlays

import type { CSSProperties } from 'react'

export const CUSTOM_COLOR_PICKER_WIDTH_PX = 280
const POPUP_GAP_PX = 8
const VIEWPORT_MARGIN_PX = 8

// position a popup directly below a trigger button, right-aligned
export function computeColorPickerStyle(btn: HTMLButtonElement): CSSProperties
{
  const rect = btn.getBoundingClientRect()

  return {
    position: 'fixed',
    top: rect.bottom + POPUP_GAP_PX,
    right: window.innerWidth - rect.right,
  }
}

// position the custom color popup below the swatch tray, clamped to viewport
export function computeCustomColorPickerStyle(
  btn: HTMLButtonElement,
  tray: HTMLDivElement | null,
  popupWidth: number,
  popupHeight = 0
): CSSProperties
{
  const trayRect = tray?.getBoundingClientRect()
  const buttonRect = btn.getBoundingClientRect()
  const anchorBottom = trayRect?.bottom ?? buttonRect.bottom
  const anchorLeft = trayRect?.left ?? buttonRect.left
  const maxLeft = window.innerWidth - popupWidth - VIEWPORT_MARGIN_PX
  const maxTop = window.innerHeight - popupHeight - VIEWPORT_MARGIN_PX

  return {
    position: 'fixed',
    top: Math.min(
      anchorBottom + POPUP_GAP_PX,
      Math.max(VIEWPORT_MARGIN_PX, maxTop)
    ),
    left: Math.min(
      Math.max(anchorLeft, VIEWPORT_MARGIN_PX),
      Math.max(VIEWPORT_MARGIN_PX, maxLeft)
    ),
  }
}

// position a settings menu below or above a trigger button depending on space
export function computeSettingsMenuStyle(
  btn: HTMLButtonElement
): CSSProperties
{
  const rect = btn.getBoundingClientRect()
  const menuHeight = 230
  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow >= menuHeight + 8)
  {
    return {
      position: 'fixed',
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    }
  }
  return {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + 8,
    right: window.innerWidth - rect.right,
  }
}
