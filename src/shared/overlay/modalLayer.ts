// src/shared/overlay/modalLayer.ts
// active modal registry & background inert handling

import { useEffect, useRef } from 'react'

const activeLayers = new Set<symbol>()
let previousAriaHidden: string | null = null
let previousInert = false
let previousOverflow: string | null = null

const getAppShell = (): HTMLElement | null =>
  document.getElementById('app-shell') ??
  document.querySelector<HTMLElement>('main')

export const hasActiveModalLayer = (): boolean => activeLayers.size > 0

// scrollbar-gutter: stable (in app/index.css) reserves the scrollbar's width
// even when overflow: hidden hides it, so fixed-position chrome stays put.
// no body padding-right hack required
const applyInert = (appShell: HTMLElement): void =>
{
  previousAriaHidden = appShell.getAttribute('aria-hidden')
  previousInert = appShell.hasAttribute('inert')
  previousOverflow = document.body.style.overflow
  appShell.setAttribute('aria-hidden', 'true')
  appShell.setAttribute('inert', '')
  document.body.style.overflow = 'hidden'
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
