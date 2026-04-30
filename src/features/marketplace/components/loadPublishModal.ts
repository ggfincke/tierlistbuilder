// src/features/marketplace/components/loadPublishModal.ts
// dynamic loader for the optional template publish modal chunk

type PublishModalModule = typeof import('./PublishModal')

export const loadPublishModal = (): Promise<PublishModalModule> =>
  import('./PublishModal')

export const preloadPublishModal = (): void =>
{
  if (typeof window === 'undefined') return
  void loadPublishModal().catch(() => undefined)
}
