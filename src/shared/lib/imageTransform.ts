// src/shared/lib/imageTransform.ts
// thin re-export — pure math lives in contracts so convex code can reuse it;
// existing browser call sites still import from here

export {
  clampItemTransform,
  createIdentityTransform,
  isIdentityTransform,
  isSameItemTransform,
  itemTransformToCropCss,
  resolveManualCropFitZoom,
  resolveManualCropImageSize,
} from '@tierlistbuilder/contracts/workspace/imageMath'
