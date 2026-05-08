// src/shared/lib/initials.ts
// normalize display names into one-character avatar initials

export const extractInitial = (name: string, fallback = 'U'): string =>
{
  const trimmed = name.trim().replace(/^@+/, '')
  return (trimmed || fallback).slice(0, 1).toUpperCase()
}
