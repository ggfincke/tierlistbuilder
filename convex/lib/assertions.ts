// convex/lib/assertions.ts
// validation primitives shared across Convex input validators

import { failInput } from './text'

export const assertNonemptyString = (name: string, value: string): void =>
{
  if (value.trim().length === 0) failInput(`${name} must be nonempty`)
}

export const assertNonnegativeInteger = (name: string, value: number): void =>
{
  if (!Number.isInteger(value) || value < 0)
  {
    failInput(`${name} must be a nonnegative integer`)
  }
}

export const assertPositiveInteger = (name: string, value: number): void =>
{
  if (!Number.isInteger(value) || value < 1)
  {
    failInput(`${name} must be a positive integer`)
  }
}

export const assertPositiveFinite = (name: string, value: number): void =>
{
  if (!Number.isFinite(value) || value <= 0)
  {
    failInput(`${name} must be a positive finite number`)
  }
}

export const assertFiniteRange = (
  name: string,
  value: number,
  min: number,
  max: number
): void =>
{
  if (!Number.isFinite(value) || value < min || value > max)
  {
    failInput(`${name} must be a finite number from ${min} to ${max}`)
  }
}

export const assertCountRange = (
  name: string,
  count: number,
  min: number,
  max: number
): void =>
{
  if (count < min || count > max)
  {
    failInput(`${name} must include ${min}..${max} entries`)
  }
}

export const assertUniqueValues = (
  name: string,
  values: readonly string[]
): void =>
{
  const seen = new Set<string>()
  for (const value of values)
  {
    assertNonemptyString(name, value)
    if (seen.has(value)) failInput(`duplicate ${name}: ${value}`)
    seen.add(value)
  }
}

export const assertExternalIdShape = (
  name: string,
  value: string,
  predicate: (value: string) => boolean,
  prefix: string
): void =>
{
  if (!predicate(value))
  {
    failInput(`invalid ${name}: must start with "${prefix}"`)
  }
}
