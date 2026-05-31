// src/features/platform/share/shortLinkRepository.ts
// frontend-only short-link adapters for the extracted UI shell

import type {
  OwnedShortLinkListItem,
  ShortLinkResolveResult,
} from '@tierlistbuilder/contracts/platform/shortLink'

const serviceUnavailable = async (): Promise<never> =>
{
  throw new Error('Short-link actions are not available in this UI-only build.')
}

export const resolveShortLinkImperative = (_args: {
  slug: string
}): Promise<ShortLinkResolveResult> => serviceUnavailable()

export const useListMyShortLinks = (
  _enabled: boolean
): OwnedShortLinkListItem[] | undefined => []

export const revokeShortLinkImperative = (_args: {
  slug: string
}): Promise<null> => serviceUnavailable()
