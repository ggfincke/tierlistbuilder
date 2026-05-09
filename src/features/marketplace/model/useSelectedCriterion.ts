// src/features/marketplace/model/useSelectedCriterion.ts
// resolves the active marketplace criterion (primary by default, overridable
// via ?criterion=). every criterion-aware surface shares this hook

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  findActiveCriterion,
  findFirstActiveCriterion,
  findPrimaryCriterion,
} from './criterionSelection'

interface SelectedCriterionResult
{
  // resolved active criterion. effectively non-null for published templates
  // since validateTemplateCriteria server-side requires ≥1 active entry
  criterion: MarketplaceTemplateCriterion
  // null when the template has only one criterion (or only the implicit
  // default), so callers can hide chips/compare buttons without re-deriving
  // that condition themselves
  visibleCriteria: MarketplaceTemplateCriterion[] | null
  // setter that writes ?criterion=<id> via history.replace so chip taps
  // don't pollute the back-stack. clears the param when set to the primary
  setCriterion: (externalId: string) => void
}

const PARAM_KEY = 'criterion'

// resolve the active criterion from URL + template metadata. returns null
// only when no active criterion exists; treat null as "consensus surface
// unavailable for this template" (the backend normally prevents this)
export const resolveSelectedCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[],
  requestedExternalId: string | null
): MarketplaceTemplateCriterion | null =>
{
  if (requestedExternalId)
  {
    const requested = findActiveCriterion(criteria, requestedExternalId)
    if (requested) return requested
  }
  const primary = findPrimaryCriterion(criteria)
  if (primary) return primary
  return findFirstActiveCriterion(criteria)
}

// chips need ≥2 active criteria to be useful; templates w/ only the
// default lane fall through to single-lane copy in the consensus header
const computeVisibleCriteria = (
  criteria: readonly MarketplaceTemplateCriterion[]
): MarketplaceTemplateCriterion[] | null =>
{
  const active = criteria.filter((c) => c.status === 'active')
  if (active.length <= 1) return null
  return [...active].sort((a, b) => a.order - b.order)
}

export const useSelectedCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[]
): SelectedCriterionResult =>
{
  const [params, setParams] = useSearchParams()
  const requested = params.get(PARAM_KEY)

  const visibleCriteria = useMemo(
    () => computeVisibleCriteria(criteria),
    [criteria]
  )

  const criterion = useMemo(
    () =>
      // the backend guarantees ≥1 active criterion; when an upstream regress
      // lands an empty array we fall back to the first criterion so the page
      // still renders something legible instead of throwing
      resolveSelectedCriterion(criteria, requested) ??
      criteria[0] ??
      buildEmptyFallback(),
    [criteria, requested]
  )

  const primaryExternalId = useMemo(
    () => findPrimaryCriterion(criteria)?.externalId ?? null,
    [criteria]
  )

  const setCriterion = useCallback(
    (externalId: string) =>
    {
      setParams(
        (prev) =>
        {
          const next = new URLSearchParams(prev)
          if (externalId === primaryExternalId)
          {
            next.delete(PARAM_KEY)
          }
          else
          {
            next.set(PARAM_KEY, externalId)
          }
          return next
        },
        { replace: true }
      )
    },
    [primaryExternalId, setParams]
  )

  return { criterion, visibleCriteria, setCriterion }
}

// last-resort placeholder so the hook can't return undefined. callers that
// see this in practice should treat it as a validation failure upstream —
// the server-side schema rejects empty criteria arrays
const buildEmptyFallback = (): MarketplaceTemplateCriterion => ({
  externalId: 'default',
  name: 'Overall',
  shortName: null,
  prompt: '',
  axisTop: null,
  axisBottom: null,
  order: 0,
  isPrimary: true,
  status: 'active',
})
