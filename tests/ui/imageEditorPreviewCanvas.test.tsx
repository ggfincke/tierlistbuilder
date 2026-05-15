// tests/ui/imageEditorPreviewCanvas.test.tsx
// preview canvas rendering for image-backed vs text-only editor items

import React, { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { ImageEditorPreviewCanvas } from '~/features/workspace/imageEditor/ui/ImageEditorPreviewCanvas'
import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'

const NOOP = () =>
{
  /* test handler */
}

const labelDisplay: ResolvedLabelDisplay = {
  placement: { mode: 'overlay', x: 0.5, y: 0.5 },
  scrim: 'dark',
  fontSizePx: 12,
  textStyleId: undefined,
  textColor: 'auto',
  text: 'Caption text',
}

const textOnlyItem = {
  id: 'item-text',
  label: 'Text-only tile',
  backgroundColor: '#111827',
} as TierItem

const renderCanvas = (
  item: TierItem,
  overrides: Partial<ComponentProps<typeof ImageEditorPreviewCanvas>> = {}
) =>
  renderToStaticMarkup(
    <ImageEditorPreviewCanvas
      item={item}
      url={null}
      hasImage={false}
      previewW={240}
      previewH={180}
      canvasRef={createRef<HTMLDivElement>()}
      captionPreviewMode={false}
      resolvedPlacement={{ mode: 'overlay', x: 0.5, y: 0.5 }}
      previewLabelDisplay={labelDisplay}
      imgClass=""
      imgStyle={{}}
      isDragging={false}
      snap={{ x: false, y: false }}
      placementDraft={null}
      labelDragSnap={{ x: false, y: false }}
      showLivePreview={false}
      onPointerDown={NOOP}
      onPointerMove={NOOP}
      onPointerEnd={NOOP}
      onLabelDragMove={NOOP}
      onLabelDragEnd={NOOP}
      {...overrides}
    />
  )

describe('ImageEditorPreviewCanvas', () =>
{
  it('renders text-only items instead of a permanent loading state', () =>
  {
    const markup = renderCanvas(textOnlyItem)

    expect(markup).toContain('Text-only tile')
    expect(markup).toContain('background-color:#111827')
    expect(markup).not.toContain('Loading...')
  })

  it('keeps unresolved image-backed items in the loading state', () =>
  {
    const markup = renderCanvas(
      { ...textOnlyItem, imageRef: { hash: 'image-hash' } },
      { hasImage: true }
    )

    expect(markup).toContain('Loading...')
    expect(markup).not.toContain('Text-only tile')
  })

  it('does not duplicate image caption chrome around text-only previews', () =>
  {
    const markup = renderCanvas(textOnlyItem, {
      captionPreviewMode: true,
      resolvedPlacement: { mode: 'captionAbove' },
      previewLabelDisplay: {
        ...labelDisplay,
        placement: { mode: 'captionAbove' },
      },
      showLivePreview: true,
    })

    expect(markup).toContain('Text-only tile')
    expect(markup).not.toContain('Caption text')
  })
})
