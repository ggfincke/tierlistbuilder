// src/features/workspace/shortcuts/model/imageEditorShortcuts.ts
// image-editor modal nav shortcuts (prev/next/skip)

type ImageEditorNavShortcut = 'prev' | 'next' | 'skip'

export const getImageEditorNavShortcut = (
  event: Pick<KeyboardEvent, 'key'>
): ImageEditorNavShortcut | null =>
{
  if (event.key === '[') return 'prev'
  if (event.key === ']') return 'next'
  if (event.key === 's' || event.key === 'S') return 'skip'
  return null
}
