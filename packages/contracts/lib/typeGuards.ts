// packages/contracts/lib/typeGuards.ts
// shared runtime type guards for frontend & backend code

// narrow an unknown to a finite number
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// narrow an unknown to a strictly-positive finite number
export const isPositiveFiniteNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0
