// src/features/marketplace/model/detail/useSelectedStyle.ts
// resolves the active image style (skin) -- default unless ?style= overrides.
// shared by the hero switcher & the fork CTA so the chosen skin threads through

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { TemplateStyleOption } from '@tierlistbuilder/contracts/marketplace/template'

interface SelectedStyleResult
{
  // resolved active style externalId; null only when the template has no styles
  styleId: string | null
  // null when <=1 selectable style, so callers hide the switcher
  visibleStyles: TemplateStyleOption[] | null
  // writes ?style=<id> via history.replace; clears the param on the default
  setStyle: (externalId: string) => void
}

const PARAM_KEY = 'style'

const findDefaultStyle = (
  styles: readonly TemplateStyleOption[]
): TemplateStyleOption | null =>
  styles.find((style) => style.isDefault) ?? styles[0] ?? null

export const useSelectedStyle = (
  styles: readonly TemplateStyleOption[]
): SelectedStyleResult =>
{
  const [params, setParams] = useSearchParams()
  const requested = params.get(PARAM_KEY)

  const defaultStyleId = useMemo(
    () => findDefaultStyle(styles)?.externalId ?? null,
    [styles]
  )

  const styleId = useMemo(
    () =>
      requested && styles.some((style) => style.externalId === requested)
        ? requested
        : defaultStyleId,
    [styles, requested, defaultStyleId]
  )

  const visibleStyles = useMemo(
    () => (styles.length <= 1 ? null : [...styles]),
    [styles]
  )

  const setStyle = useCallback(
    (externalId: string) =>
    {
      setParams(
        (prev) =>
        {
          const next = new URLSearchParams(prev)
          if (externalId === defaultStyleId) next.delete(PARAM_KEY)
          else next.set(PARAM_KEY, externalId)
          return next
        },
        { replace: true }
      )
    },
    [defaultStyleId, setParams]
  )

  return { styleId, visibleStyles, setStyle }
}
