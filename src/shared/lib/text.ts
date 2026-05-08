// src/shared/lib/text.ts
// text normalization helpers for search & matching

export const foldForSearch = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
