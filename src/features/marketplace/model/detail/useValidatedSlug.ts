// src/features/marketplace/model/detail/useValidatedSlug.ts
// route-param slug validation for marketplace detail pages

import { useParams } from 'react-router-dom'

export const useValidatedSlug = <TSlug extends string>(
  validator: (slug: string) => slug is TSlug
): TSlug | null =>
{
  const { slug } = useParams<{ slug: string }>()
  return slug && validator(slug) ? slug : null
}
