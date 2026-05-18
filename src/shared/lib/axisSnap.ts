// src/shared/lib/axisSnap.ts
// generic 1-axis snap helper. callers compose snap candidates (eg center,
// image edges, crop rect edges) + a threshold; first match wins

interface AxisSnapCandidate
{
  value: number
  // when true, the caller should render an alignment guide for this snap
  guide: boolean
}

export const applyAxisSnap = (
  value: number,
  threshold: number,
  candidates: readonly AxisSnapCandidate[]
): { value: number; guide: boolean } =>
{
  for (const candidate of candidates)
  {
    if (Math.abs(value - candidate.value) < threshold)
    {
      return { value: candidate.value, guide: candidate.guide }
    }
  }
  return { value, guide: false }
}
