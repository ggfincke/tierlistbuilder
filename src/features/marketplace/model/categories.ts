// src/features/marketplace/model/categories.ts
// presentation metadata for marketplace template categories

import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/category'

export interface CategoryMeta
{
  id: TemplateCategory
  label: string
  // hue accent applied to the category gradient fallback when neither a cover
  // image nor any image-bearing items are available
  gradient: string
}

export const CATEGORY_META: Record<TemplateCategory, CategoryMeta> = {
  gaming: {
    id: 'gaming',
    label: 'Gaming',
    gradient: 'linear-gradient(135deg, #4338ca 0%, #7e22ce 50%, #be185d 100%)',
  },
  movies: {
    id: 'movies',
    label: 'Movies & TV',
    gradient: 'linear-gradient(135deg, #0e7490 0%, #1e3a8a 100%)',
  },
  anime: {
    id: 'anime',
    label: 'Anime & Manga',
    gradient: 'linear-gradient(135deg, #db2777 0%, #6d28d9 100%)',
  },
  music: {
    id: 'music',
    label: 'Music',
    gradient: 'linear-gradient(135deg, #b45309 0%, #b91c1c 50%, #9d174d 100%)',
  },
  sports: {
    id: 'sports',
    label: 'Sports',
    gradient: 'linear-gradient(135deg, #15803d 0%, #075985 100%)',
  },
  food: {
    id: 'food',
    label: 'Food & Drink',
    gradient: 'linear-gradient(135deg, #c2410c 0%, #a16207 100%)',
  },
  books: {
    id: 'books',
    label: 'Books & Lit',
    gradient: 'linear-gradient(135deg, #92400e 0%, #4c1d95 100%)',
  },
  tech: {
    id: 'tech',
    label: 'Tech & Products',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0f766e 100%)',
  },
  other: {
    id: 'other',
    label: 'Other',
    gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
  },
}

export const CATEGORY_LIST: readonly CategoryMeta[] = TEMPLATE_CATEGORIES.map(
  (id) => CATEGORY_META[id]
)
