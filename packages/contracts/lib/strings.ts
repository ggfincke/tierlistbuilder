// packages/contracts/lib/strings.ts
// shared string normalization helpers for frontend & backend contracts

// trim user input & cap it to a maximum length; empty input stays empty so
// callers can decide their own fallback semantics
export const normalizeStringInput = (
  raw: string,
  maxLength: number
): string =>
{
  const trimmed = raw.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}
