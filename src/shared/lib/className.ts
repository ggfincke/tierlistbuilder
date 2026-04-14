// src/shared/lib/className.ts
// shared className helper — concatenate base & optional additions, skipping falsy parts

export const joinClassNames = (
  ...parts: (string | false | null | undefined)[]
): string => parts.filter(Boolean).join(' ')
