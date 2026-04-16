// src/shared/lib/pluralize.ts
// count-aware word helpers for short UI strings

export const pluralizeWord = (
  count: number,
  singular: string,
  plural = `${singular}s`
): string => (count === 1 ? singular : plural)

export const pluralizeVerb = (
  count: number,
  singular: string,
  plural: string
): string => (count === 1 ? singular : plural)
