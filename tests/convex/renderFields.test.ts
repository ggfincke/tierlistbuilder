// tests/convex/renderFields.test.ts
// Guard Convex render-field mappers & contract-bound validators.

import { describe, expect, it } from 'vitest'
import type { Doc } from '@convex/_generated/dataModel'
import {
  BOARD_RENDER_FIELDS,
  buildRenderSourceFields,
  renderFieldsFromArgs,
  renderFieldsToWire,
} from '@convex/lib/templates/renderFields'
import {
  boardRenderFieldValidators,
  templateRenderFieldValidators,
  validateBoardAspectRatio,
  validateImagePadding,
  validateNaturalAspectRatio,
} from '@convex/lib/validators/common'
import {
  IMAGE_PADDING_MAX,
  IMAGE_PADDING_MIN,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  BOARD_ITEM_ASPECT_RATIO_MAX,
  BOARD_ITEM_ASPECT_RATIO_MIN,
} from '@tierlistbuilder/contracts/workspace/aspectRatio'

const RENDER_FIELD_KEYS = [
  'itemAspectRatio',
  'itemAspectRatioMode',
  'defaultItemImageFit',
  'defaultItemImagePadding',
  'labels',
  'autoPlate',
] as const

describe('render-field contract keys', () =>
{
  it('keeps mapper keys aligned with Convex schema fragments', () =>
  {
    expect(BOARD_RENDER_FIELDS).toEqual(RENDER_FIELD_KEYS)
    expect(Object.keys(templateRenderFieldValidators)).toEqual(
      RENDER_FIELD_KEYS
    )
    expect(Object.keys(boardRenderFieldValidators)).toEqual(RENDER_FIELD_KEYS)
  })
})

describe('render-field mappers', () =>
{
  it('normalizes template/style render fields for board writes', () =>
  {
    const source = {
      itemAspectRatio: 1.5,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'contain',
      defaultItemImagePadding: 0.12,
      labels: { show: true },
      autoPlate: { mode: 'auto' },
    } satisfies Pick<Doc<'templates'>, (typeof RENDER_FIELD_KEYS)[number]>

    expect(buildRenderSourceFields(source)).toEqual(source)
  })

  it('centralizes null database values and undefined wire values', () =>
  {
    const dbFields = renderFieldsFromArgs({})
    expect(dbFields).toEqual({
      itemAspectRatio: null,
      itemAspectRatioMode: null,
      defaultItemImageFit: null,
      defaultItemImagePadding: null,
      labels: null,
      autoPlate: undefined,
    })

    expect(renderFieldsToWire(dbFields)).toEqual({
      itemAspectRatio: undefined,
      itemAspectRatioMode: undefined,
      defaultItemImageFit: undefined,
      defaultItemImagePadding: undefined,
      labels: undefined,
      autoPlate: undefined,
    })
  })
})

describe('render-field bounds', () =>
{
  it('accepts contract min/max values', () =>
  {
    expect(() =>
      validateImagePadding(IMAGE_PADDING_MIN, 'imagePadding')
    ).not.toThrow()
    expect(() =>
      validateImagePadding(IMAGE_PADDING_MAX, 'imagePadding')
    ).not.toThrow()
    expect(() =>
      validateBoardAspectRatio(BOARD_ITEM_ASPECT_RATIO_MIN, 'aspectRatio')
    ).not.toThrow()
    expect(() =>
      validateBoardAspectRatio(BOARD_ITEM_ASPECT_RATIO_MAX, 'aspectRatio')
    ).not.toThrow()
    expect(() =>
      validateNaturalAspectRatio(16, 'item.aspectRatio')
    ).not.toThrow()
    expect(() =>
      validateNaturalAspectRatio(100, 'item.aspectRatio')
    ).not.toThrow()
  })

  it('rejects values outside the contract bounds', () =>
  {
    expect(() =>
      validateImagePadding(IMAGE_PADDING_MIN - 0.01, 'imagePadding')
    ).toThrow(/imagePadding must be a finite number/)
    expect(() =>
      validateImagePadding(IMAGE_PADDING_MAX + 0.01, 'imagePadding')
    ).toThrow(/imagePadding must be a finite number/)
    expect(() =>
      validateBoardAspectRatio(
        BOARD_ITEM_ASPECT_RATIO_MIN - 0.01,
        'aspectRatio'
      )
    ).toThrow(/aspectRatio must be a finite number/)
    expect(() =>
      validateBoardAspectRatio(
        BOARD_ITEM_ASPECT_RATIO_MAX + 0.01,
        'aspectRatio'
      )
    ).toThrow(/aspectRatio must be a finite number/)
    expect(() => validateNaturalAspectRatio(0, 'item.aspectRatio')).toThrow(
      /item\.aspectRatio must be a positive finite number/
    )
  })
})
