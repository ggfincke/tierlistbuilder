// src/hooks/useModalBackgroundInert.ts
// hide the app shell from focus & screen readers while modal layers are open

import { useEffect } from 'react'

let activeModalLayerCount = 0
let previousAriaHidden: string | null = null
let previousInert = false
let previousOverflow: string | null = null
let previousPaddingRight: string | null = null

const getAppShell = (): HTMLElement | null =>
  document.getElementById('app-shell') ??
  document.querySelector<HTMLElement>('main')

export const hasActiveModalLayer = (): boolean => activeModalLayerCount > 0

export const useModalBackgroundInert = (active: boolean) =>
{
  useEffect(() =>
  {
    if (!active)
    {
      return
    }

    const appShell = getAppShell()

    if (!appShell)
    {
      return
    }

    if (activeModalLayerCount === 0)
    {
      previousAriaHidden = appShell.getAttribute('aria-hidden')
      previousInert = appShell.hasAttribute('inert')
      previousOverflow = document.body.style.overflow
      previousPaddingRight = document.body.style.paddingRight
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      appShell.setAttribute('aria-hidden', 'true')
      appShell.setAttribute('inert', '')
      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0)
      {
        document.body.style.paddingRight = `${scrollbarWidth}px`
      }
    }

    activeModalLayerCount += 1

    return () =>
    {
      activeModalLayerCount = Math.max(0, activeModalLayerCount - 1)

      if (activeModalLayerCount > 0)
      {
        return
      }

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
  }, [active])
}
