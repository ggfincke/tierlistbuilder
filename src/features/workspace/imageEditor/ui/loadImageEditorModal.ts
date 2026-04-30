// src/features/workspace/imageEditor/ui/loadImageEditorModal.ts
// dynamic loader for the optional image editor modal chunk

type ImageEditorModalModule = typeof import('./ImageEditorModal')

export const loadImageEditorModal = (): Promise<ImageEditorModalModule> =>
  import('./ImageEditorModal')

export const preloadImageEditorModal = (): void =>
{
  if (typeof window === 'undefined') return
  void loadImageEditorModal().catch(() => undefined)
}
