// src/hooks/useFocusTrap.ts
// keep focus inside the topmost modal layer & restore it on close

import { useEffect, type RefObject } from 'react'

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
  options: boolean | UseFocusTrapOptions
) =>
{
  const {
    active,
    initialFocusRef,
    restoreFocus = true,
  } = typeof options === 'boolean'
    ? { active: options, initialFocusRef: undefined, restoreFocus: true }
    : options

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
