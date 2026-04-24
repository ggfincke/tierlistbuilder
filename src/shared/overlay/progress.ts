// src/shared/overlay/progress.ts
// progress normalization for blocking overlay UIs

export interface ProgressOverlayState
{
  visible: boolean
  current: number
  total: number
  percent: number
}

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

export const resolveProgressOverlayState = (
  current: number,
  total: number
): ProgressOverlayState =>
{
  const normalizedTotal = finiteNonNegative(total)

  if (normalizedTotal === 0)
  {
    return {
      visible: false,
      current: 0,
      total: 0,
      percent: 0,
    }
  }

  const normalizedCurrent = Math.min(
    finiteNonNegative(current),
    normalizedTotal
  )

  return {
    visible: true,
    current: normalizedCurrent,
    total: normalizedTotal,
    percent: Math.round((normalizedCurrent / normalizedTotal) * 100),
  }
}
