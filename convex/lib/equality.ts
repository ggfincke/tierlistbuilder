// convex/lib/equality.ts
// order-insensitive structural equality for Convex patch / upsert change checks

export const valuesEqual = (left: unknown, right: unknown): boolean =>
{
  if (Object.is(left, right)) return true
  if (left === null || right === null) return false
  if (typeof left !== typeof right) return false
  if (typeof left !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left) && Array.isArray(right))
  {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1)
    {
      if (!valuesEqual(left[index], right[index])) return false
    }
    return true
  }
  const leftKeys = Object.keys(left as Record<string, unknown>)
  const rightKeys = Object.keys(right as Record<string, unknown>)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys)
  {
    if (
      !Object.prototype.hasOwnProperty.call(right, key) ||
      !valuesEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key]
      )
    )
    {
      return false
    }
  }
  return true
}
