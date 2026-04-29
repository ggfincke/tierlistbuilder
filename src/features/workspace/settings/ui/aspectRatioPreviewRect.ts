// src/features/workspace/settings/ui/aspectRatioPreviewRect.ts
// ratio-preview rectangle sizing shared by chips & tiles

export const fitRectInBox = (ratio: number, maxSize: number) =>
  ratio >= 1
    ? { width: maxSize, height: Math.max(2, maxSize / ratio) }
    : { width: Math.max(2, maxSize * ratio), height: maxSize }
