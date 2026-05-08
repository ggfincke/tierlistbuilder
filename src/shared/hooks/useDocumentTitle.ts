// src/shared/hooks/useDocumentTitle.ts
// preserve & restore document titles for route surfaces

import { useEffect } from 'react'

export const useDocumentTitle = (title: string | null | undefined): void =>
{
  useEffect(() =>
  {
    if (!title) return

    const previous = document.title
    document.title = title
    return () =>
    {
      document.title = previous
    }
  }, [title])
}
