// src/shared/images/imageUrlChainRequests.ts
// select cloud image requests needed to resolve a priority-ordered URL chain

import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

interface ImageUrlChainSource
{
  hash: string
  cloudMediaExternalId: string
  variant: MediaVariantKind
}

export const collectMissingCloudImageChainRequests = (
  sources: readonly ImageUrlChainSource[],
  getCachedUrl: (hash: string) => string | null
): ImageUrlChainSource[] =>
{
  const requests: ImageUrlChainSource[] = []

  for (const source of sources)
  {
    if (getCachedUrl(source.hash)) break
    if (source.cloudMediaExternalId)
    {
      requests.push(source)
    }
  }

  return requests
}
