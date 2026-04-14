// src/shared/overlay/popupPosition.ts
// shared popup positioning utilities for fixed overlays

import type { CSSProperties } from 'react'
import {
  FIXED_POPUP_GAP_PX,
  ITEM_EDIT_POPOVER_GAP_PX,
  ITEM_EDIT_POPOVER_MIN_HEIGHT_PX,
  OVERLAY_VIEWPORT_MARGIN_PX,
  SETTINGS_MENU_HEIGHT_PX,
} from './uiMeasurements'

interface ViewportSize
{
  width: number
  height: number
}

type AnchoredRect = Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>

const resolveViewport = (viewport?: ViewportSize): ViewportSize =>
  viewport ?? {
    width: window.innerWidth,
    height: window.innerHeight,
  }

const clampPopupTop = (
  top: number,
  popupHeight: number,
  viewportHeight: number
): number =>
  Math.min(
    top,
    Math.max(
      OVERLAY_VIEWPORT_MARGIN_PX,
      viewportHeight - popupHeight - OVERLAY_VIEWPORT_MARGIN_PX
    )
  )

const clampPopupLeft = (
  left: number,
  popupWidth: number,
  viewportWidth: number
): number =>
  Math.min(
    Math.max(left, OVERLAY_VIEWPORT_MARGIN_PX),
    Math.max(
      OVERLAY_VIEWPORT_MARGIN_PX,
      viewportWidth - popupWidth - OVERLAY_VIEWPORT_MARGIN_PX
    )
  )

// position a popup directly below a trigger button, right-aligned
export function computeColorPickerStyle(
  btn: HTMLButtonElement,
  viewport?: ViewportSize
): CSSProperties
{
  const rect = btn.getBoundingClientRect()
  const { width } = resolveViewport(viewport)

  return {
    position: 'fixed',
    top: rect.bottom + FIXED_POPUP_GAP_PX,
    right: width - rect.right,
  }
}

// position the custom color popup below the swatch tray, clamped to viewport
export function computeCustomColorPickerStyle(
  btn: HTMLButtonElement,
  tray: HTMLDivElement | null,
  popupWidth: number,
  popupHeight = 0,
  viewport?: ViewportSize
): CSSProperties
{
  const trayRect = tray?.getBoundingClientRect()
  const buttonRect = btn.getBoundingClientRect()
  const anchorBottom = trayRect?.bottom ?? buttonRect.bottom
  const anchorLeft = trayRect?.left ?? buttonRect.left
  const { width, height } = resolveViewport(viewport)

  return {
    position: 'fixed',
    top: clampPopupTop(anchorBottom + FIXED_POPUP_GAP_PX, popupHeight, height),
    left: clampPopupLeft(anchorLeft, popupWidth, width),
  }
}

// position a settings menu below or above a trigger button depending on space
export function computeSettingsMenuStyle(
  btn: HTMLButtonElement,
  viewport?: ViewportSize
): CSSProperties
{
  const rect = btn.getBoundingClientRect()
  const { width, height } = resolveViewport(viewport)
  const spaceBelow = height - rect.bottom
  if (spaceBelow >= SETTINGS_MENU_HEIGHT_PX + FIXED_POPUP_GAP_PX)
  {
    return {
      position: 'fixed',
      top: rect.bottom + FIXED_POPUP_GAP_PX,
      right: width - rect.right,
    }
  }
  return {
    position: 'fixed',
    bottom: height - rect.top + FIXED_POPUP_GAP_PX,
    right: width - rect.right,
  }
}

// position the alt-text popover below the item, clamped to the viewport
export function computeItemEditPopoverStyle(
  anchorRect: AnchoredRect,
  popupWidth: number,
  popupHeight = ITEM_EDIT_POPOVER_MIN_HEIGHT_PX,
  viewport?: ViewportSize
): CSSProperties
{
  const { width, height } = resolveViewport(viewport)

  return {
    position: 'fixed',
    top: clampPopupTop(
      anchorRect.bottom + ITEM_EDIT_POPOVER_GAP_PX,
      popupHeight,
      height
    ),
    left: clampPopupLeft(anchorRect.left, popupWidth, width),
  }
}
