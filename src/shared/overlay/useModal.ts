// src/shared/overlay/useModal.ts
// consolidated modal behavior: focus trap, inert background shell, & Escape dismissal

import { useEffect, useRef, type RefObject } from 'react'

// focus trap internals

interface UseFocusTrapOptions
{
  active: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
}

interface FocusTrapEntry
{
  token: symbol
  focus: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

const ACTIVE_FOCUS_TRAPS: FocusTrapEntry[] = []

const isVisibleFocusableElement = (element: HTMLElement): boolean =>
{
  if (element.matches('[hidden], [disabled], [aria-hidden="true"]'))
  {
    return false
  }

  if (element.closest('[inert]'))
  {
    return false
  }

  const style = window.getComputedStyle(element)

  if (style.display === 'none' || style.visibility === 'hidden')
  {
    return false
  }

  return element.getClientRects().length > 0
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(isVisibleFocusableElement)

const focusElement = (element: HTMLElement) =>
{
  element.focus({ preventScroll: true })
}

const getTopmostFocusTrap = (): FocusTrapEntry | undefined =>
  ACTIVE_FOCUS_TRAPS[ACTIVE_FOCUS_TRAPS.length - 1]

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement | null>,
  { active, initialFocusRef, restoreFocus = true }: UseFocusTrapOptions
) =>
{
  useEffect(() =>
  {
    if (!active)
    {
      return
    }

    const container = containerRef.current

    if (!container)
    {
      return
    }

    const previousFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const token = Symbol('focus-trap')
    const hadTabIndex = container.hasAttribute('tabindex')
    const originalTabIndex = container.getAttribute('tabindex')

    if (!hadTabIndex)
    {
      container.setAttribute('tabindex', '-1')
    }

    const focusInitialTarget = () =>
    {
      if (getTopmostFocusTrap()?.token !== token)
      {
        return
      }

      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null

      if (activeElement && container.contains(activeElement))
      {
        return
      }

      const preferredTarget = initialFocusRef?.current

      if (
        preferredTarget &&
        container.contains(preferredTarget) &&
        isVisibleFocusableElement(preferredTarget)
      )
      {
        focusElement(preferredTarget)
        return
      }

      const focusableElements = getFocusableElements(container)

      if (focusableElements.length > 0)
      {
        focusElement(focusableElements[0])
        return
      }

      focusElement(container)
    }

    ACTIVE_FOCUS_TRAPS.push({
      token,
      focus: focusInitialTarget,
    })

    const focusFrame = requestAnimationFrame(focusInitialTarget)

    const handleFocusIn = (event: FocusEvent) =>
    {
      if (getTopmostFocusTrap()?.token !== token)
      {
        return
      }

      const target = event.target

      if (!(target instanceof HTMLElement) || container.contains(target))
      {
        return
      }

      focusInitialTarget()
    }

    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (getTopmostFocusTrap()?.token !== token || event.key !== 'Tab')
      {
        return
      }

      const focusableElements = getFocusableElements(container)

      if (focusableElements.length === 0)
      {
        event.preventDefault()
        focusElement(container)
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null

      if (!activeElement || !container.contains(activeElement))
      {
        event.preventDefault()
        focusElement(event.shiftKey ? lastElement : firstElement)
        return
      }

      if (event.shiftKey && activeElement === firstElement)
      {
        event.preventDefault()
        focusElement(lastElement)
      }
      else if (!event.shiftKey && activeElement === lastElement)
      {
        event.preventDefault()
        focusElement(firstElement)
      }
    }

    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () =>
    {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('keydown', handleKeyDown, true)

      const trapIndex = ACTIVE_FOCUS_TRAPS.findIndex(
        (entry) => entry.token === token
      )

      if (trapIndex >= 0)
      {
        ACTIVE_FOCUS_TRAPS.splice(trapIndex, 1)
      }

      if (hadTabIndex)
      {
        container.setAttribute('tabindex', originalTabIndex ?? '-1')
      }
      else
      {
        container.removeAttribute('tabindex')
      }

      if (!restoreFocus)
      {
        return
      }

      requestAnimationFrame(() =>
      {
        if (previousFocusedElement?.isConnected)
        {
          focusElement(previousFocusedElement)
          return
        }

        getTopmostFocusTrap()?.focus()
      })
    }
  }, [active, containerRef, initialFocusRef, restoreFocus])
}

// modal-background inert tracking

// registry of active layer keys — Set ops are idempotent by symbol identity,
// keeping the count correct across StrictMode mount/cleanup/mount cycles
const activeLayers = new Set<symbol>()
let previousAriaHidden: string | null = null
let previousInert = false
let previousOverflow: string | null = null
let previousPaddingRight: string | null = null

const getAppShell = (): HTMLElement | null =>
  document.getElementById('app-shell') ??
  document.querySelector<HTMLElement>('main')

export const hasActiveModalLayer = (): boolean => activeLayers.size > 0

const applyInert = (appShell: HTMLElement): void =>
{
  previousAriaHidden = appShell.getAttribute('aria-hidden')
  previousInert = appShell.hasAttribute('inert')
  previousOverflow = document.body.style.overflow
  previousPaddingRight = document.body.style.paddingRight
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth
  appShell.setAttribute('aria-hidden', 'true')
  appShell.setAttribute('inert', '')
  document.body.style.overflow = 'hidden'
  if (scrollbarWidth > 0)
  {
    document.body.style.paddingRight = `${scrollbarWidth}px`
  }
}

const releaseInert = (appShell: HTMLElement): void =>
{
  if (!previousInert)
  {
    appShell.removeAttribute('inert')
  }

  if (previousAriaHidden === null)
  {
    appShell.removeAttribute('aria-hidden')
  }
  else
  {
    appShell.setAttribute('aria-hidden', previousAriaHidden)
  }

  document.body.style.overflow = previousOverflow ?? ''
  document.body.style.paddingRight = previousPaddingRight ?? ''
}

export const useModalBackgroundInert = (active: boolean) =>
{
  const layerKeyRef = useRef<symbol | null>(null)

  useEffect(() =>
  {
    if (!active) return

    const appShell = getAppShell()
    if (!appShell) return

    if (layerKeyRef.current === null)
    {
      layerKeyRef.current = Symbol('modal-layer')
    }
    const key = layerKeyRef.current

    const wasEmpty = activeLayers.size === 0
    activeLayers.add(key)
    if (wasEmpty)
    {
      applyInert(appShell)
    }

    return () =>
    {
      const existed = activeLayers.delete(key)
      if (!existed) return
      if (activeLayers.size > 0) return
      releaseInert(appShell)
    }
  }, [active])
}

// modal dialog stack: focus trap + inert background + topmost-only Escape

interface UseModalDialogOptions
{
  open: boolean
  dialogRef: RefObject<HTMLElement | null>
  onClose?: () => void
  onDismissAttempt?: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
  closeOnEscape?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
}

const ACTIVE_MODAL_DIALOGS: symbol[] = []

const getTopmostModalDialog = (): symbol | undefined =>
  ACTIVE_MODAL_DIALOGS[ACTIVE_MODAL_DIALOGS.length - 1]

export const useModalDialog = ({
  open,
  dialogRef,
  onClose,
  onDismissAttempt,
  initialFocusRef,
  restoreFocus = true,
  closeOnEscape = true,
  escapePhase = 'bubble',
  stopEscapePropagation = true,
}: UseModalDialogOptions) =>
{
  useFocusTrap(dialogRef, {
    active: open,
    initialFocusRef,
    restoreFocus,
  })
  useModalBackgroundInert(open)

  useEffect(() =>
  {
    if (!open)
    {
      return
    }

    const escapeShouldClose = Boolean(onClose) && closeOnEscape
    const hasEscapeHandler = escapeShouldClose || Boolean(onDismissAttempt)

    if (!hasEscapeHandler)
    {
      return
    }

    const token = Symbol('modal-dialog')
    ACTIVE_MODAL_DIALOGS.push(token)

    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented || event.key !== 'Escape')
      {
        return
      }

      if (getTopmostModalDialog() !== token)
      {
        return
      }

      if (stopEscapePropagation)
      {
        event.stopPropagation()
      }

      if (escapeShouldClose)
      {
        onClose?.()
      }
      else
      {
        onDismissAttempt?.()
      }
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
      escapePhase === 'capture'
    )

    return () =>
    {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
        escapePhase === 'capture'
      )

      const dialogIndex = ACTIVE_MODAL_DIALOGS.indexOf(token)

      if (dialogIndex >= 0)
      {
        ACTIVE_MODAL_DIALOGS.splice(dialogIndex, 1)
      }
    }
  }, [
    open,
    onClose,
    onDismissAttempt,
    closeOnEscape,
    escapePhase,
    stopEscapePropagation,
  ])
}
