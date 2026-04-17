// src/shared/overlay/useModalBackgroundInert.ts
// hide the app shell from focus & screen readers while modal layers are open

import { useEffect, useRef } from 'react'

// registry of active layer keys — Set ops are idempotent by symbol identity,
// which keeps the count correct across StrictMode mount/cleanup/mount cycles
// (a plain numeric counter would either double-count or under-count)
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
