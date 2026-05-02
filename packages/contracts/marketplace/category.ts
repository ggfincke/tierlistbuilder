// packages/contracts/marketplace/category.ts
// marketplace template category taxonomy shared across contracts & UI

export const TEMPLATE_CATEGORIES = [
  'gaming',
  'movies',
  'anime',
  'music',
  'sports',
  'food',
  'books',
  'tech',
  'other',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
