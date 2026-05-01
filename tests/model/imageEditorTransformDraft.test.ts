// tests/model/imageEditorTransformDraft.test.ts
// image-editor transform commit, rotate, nudge, zoom, & draft sync helpers

import { describe, expect, it } from 'vitest'

import {
  ITEM_TRANSFORM_IDENTITY,
  type ItemRotation,
  type ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  centerImageEditorTransform,
  nudgeImageEditorTransformByPixels,
  resolveImageEditorCommitTransform,
  rotateImageEditorWorkingTransform,
  setImageEditorDisplayZoom,
  zoomImageEditorTransformAtPoint,
} from '~/features/workspace/imageEditor/lib/imageEditorTransformOps'
import { syncImageEditorTransformDraftState } from '~/features/workspace/imageEditor/model/imageEditorTransformDraftState'

const transform = (overrides: Partial<ItemTransform> = {}): ItemTransform => ({
  ...ITEM_TRANSFORM_IDENTITY,
  ...overrides,
})

describe('image editor transform helpers', () =>
{
  it('commits null when matching baseline & preserves zoom across rotation/zoom helpers', () =>
  {
    const baseline = transform({ zoom: 1.25 })
    expect(resolveImageEditorCommitTransform(baseline, baseline)).toBeNull()
    expect(
      resolveImageEditorCommitTransform(
        transform({ zoom: 1.5, offsetX: 0.1 }),
        baseline
      )
    ).toEqual(transform({ zoom: 1.5, offsetX: 0.1 }))

    const zoomByRotation = new Map<ItemRotation, number>([
      [0, 1],
      [90, 1.5],
      [180, 1],
      [270, 1.5],
    ])
    expect(
      rotateImageEditorWorkingTransform(
        transform({ zoom: 2 }),
        90,
        (rotation) => zoomByRotation.get(rotation) ?? 1
      )
    ).toEqual(transform({ rotation: 90, zoom: 3 }))

    expect(setImageEditorDisplayZoom(transform(), 1.8, 1.25)).toEqual(
      transform({ zoom: 2.25 })
    )
  })

  it('centers + nudges pan offsets & zooms around the cursor within bounds', () =>
  {
    expect(
      centerImageEditorTransform(transform({ offsetX: 0.4, offsetY: -0.2 }))
    ).toEqual(transform())
    expect(
      nudgeImageEditorTransformByPixels(transform(), 10, -5, 200, 100)
    ).toEqual(transform({ offsetX: 0.05, offsetY: -0.05 }))

    expect(
      zoomImageEditorTransformAtPoint({
        transform: transform(),
        baselineZoom: 1,
        displayZoomMin: 0.5,
        displayZoomMax: 4,
        cursorFracX: 0.25,
        cursorFracY: -0.1,
        factor: 2,
      })
    ).toEqual(transform({ zoom: 2, offsetX: -0.25, offsetY: 0.1 }))

    expect(
      zoomImageEditorTransformAtPoint({
        transform: transform({ zoom: 3 }),
        baselineZoom: 1,
        displayZoomMin: 0.5,
        displayZoomMax: 4,
        cursorFracX: 0,
        cursorFracY: 0,
        factor: 10,
      }).zoom
    ).toBe(4)
  })

  it('adopts undo commits while keeping dirty drafts on baseline refresh', () =>
  {
    const baseline = transform()
    const cropped = transform({ zoom: 1.4, offsetX: 0.2 })
    const accepted = syncImageEditorTransformDraftState(
      { working: cropped, committed: baseline },
      cropped
    )
    expect(accepted).toEqual({ working: cropped, committed: cropped })
    expect(syncImageEditorTransformDraftState(accepted, baseline)).toEqual({
      working: baseline,
      committed: baseline,
    })

    const working = transform({ zoom: 1.6 })
    const committed = transform({ zoom: 1.2 })
    expect(
      syncImageEditorTransformDraftState(
        { working, committed: baseline },
        committed
      )
    ).toEqual({ working, committed })
  })
})
